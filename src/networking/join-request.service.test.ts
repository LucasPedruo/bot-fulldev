import assert from "node:assert/strict";
import { test } from "node:test";
import type { EnqueueMessageInput, QueueMessage, TextMessagePayload } from "../queue/queue.types.js";
import {
  isForbiddenError,
  JoinRequestService,
  type JoinRequestSocketLike,
  type QueueServiceLike
} from "./join-request.service.js";

const groupJid = "120363000000000001@g.us";

class FakeQueue implements QueueServiceLike {
  public enqueued: EnqueueMessageInput[] = [];

  async enqueue(input: EnqueueMessageInput): Promise<QueueMessage> {
    await Promise.resolve();
    this.enqueued.push(input);
    return {
      id: "queued-1",
      type: input.type,
      destinationGroup: input.destinationGroup,
      payload: input.payload,
      status: "pending",
      priority: input.priority ?? 0,
      bypassQuietHours: input.bypassQuietHours ?? false,
      scheduledFor: input.scheduledFor ?? new Date(),
      attempts: 0,
      createdAt: new Date(),
      sentAt: null,
      lastError: null,
      processingStartedAt: null
    };
  }
}

class FakeSocket implements JoinRequestSocketLike {
  public approvals: Array<{ jid: string; participants: string[]; action: string }> = [];

  constructor(
    private readonly requests: Array<Record<string, string>>,
    private readonly memberCount: number,
    private readonly failFor: string[] = []
  ) {}

  async groupMetadata(): Promise<{ participants: unknown[] }> {
    await Promise.resolve();
    return { participants: new Array<unknown>(this.memberCount).fill({}) };
  }

  async groupRequestParticipantsList(): Promise<Array<Record<string, string>>> {
    await Promise.resolve();
    return this.requests;
  }

  async groupRequestParticipantsUpdate(
    jid: string,
    participants: string[],
    action: "approve" | "reject"
  ): Promise<Array<{ status: string; jid?: string }>> {
    await Promise.resolve();
    this.approvals.push({ jid, participants, action });
    return participants.map((participant) => ({
      status: this.failFor.includes(participant) ? "409" : "200",
      jid: participant
    }));
  }
}

function buildService(socket: JoinRequestSocketLike, queue: QueueServiceLike, overrides = {}): JoinRequestService {
  return new JoinRequestService({
    networkingGroups: [groupJid],
    groupCapacity: 1024,
    waitlistNoticeCooldownHours: 24,
    queue,
    getSocket: () => socket,
    resolveJid: async (jid: string) => Promise.resolve(jid),
    ...overrides
  });
}

void test("approves real numbers when the group has free slots", async () => {
  const socket = new FakeSocket(
    [{ jid: "5511987654321@s.whatsapp.net" }, { jid: "5521999998888@s.whatsapp.net" }],
    100
  );
  const queue = new FakeQueue();

  const result = await buildService(socket, queue).processGroup(groupJid);

  assert.equal(result.pending, 2);
  assert.deepEqual(result.approved, ["5511987654321@s.whatsapp.net", "5521999998888@s.whatsapp.net"]);
  assert.equal(socket.approvals.length, 1);
  assert.equal(socket.approvals[0].action, "approve");
  assert.equal(queue.enqueued.length, 0);
});

void test("leaves suspicious numbers pending instead of rejecting them", async () => {
  const socket = new FakeSocket([{ jid: "5511987654321@s.whatsapp.net" }, { jid: "8001234567@s.whatsapp.net" }], 100);
  const queue = new FakeQueue();

  const result = await buildService(socket, queue).processGroup(groupJid);

  assert.deepEqual(result.approved, ["5511987654321@s.whatsapp.net"]);
  assert.deepEqual(result.skippedSuspicious, ["8001234567@s.whatsapp.net"]);
  // The bot must never call the API with "reject" - a human decides on those.
  assert.equal(
    socket.approvals.some((call) => call.action === "reject"),
    false
  );
  assert.deepEqual(socket.approvals[0].participants, ["5511987654321@s.whatsapp.net"]);
});

void test("approves only up to the remaining capacity", async () => {
  const socket = new FakeSocket(
    [
      { jid: "5511987654321@s.whatsapp.net" },
      { jid: "5521999998888@s.whatsapp.net" },
      { jid: "5531988887777@s.whatsapp.net" }
    ],
    1022
  );
  const queue = new FakeQueue();

  const result = await buildService(socket, queue).processGroup(groupJid);

  assert.equal(result.approved.length, 2);
  assert.deepEqual(result.skippedNoCapacity, ["5531988887777@s.whatsapp.net"]);
  // Still one free slot short of full, so no scarcity notice yet.
  assert.equal(result.waitlistNoticeSent, false);
});

void test("posts the waiting-list notice when the group is full and people are queued", async () => {
  const socket = new FakeSocket([{ jid: "5511987654321@s.whatsapp.net" }], 1024);
  const queue = new FakeQueue();

  const result = await buildService(socket, queue).processGroup(groupJid);

  assert.equal(result.approved.length, 0);
  assert.equal(result.waitlistNoticeSent, true);
  assert.equal(queue.enqueued.length, 1);
  assert.equal(queue.enqueued[0].type, "networking");
  assert.equal(queue.enqueued[0].destinationGroup, groupJid);
  // A recurring nudge must stay inside quiet hours.
  assert.notEqual(queue.enqueued[0].bypassQuietHours, true);
  assert.match((queue.enqueued[0].payload as TextMessagePayload).text, /lista de espera|fila|lotad|limite/i);
});

void test("does not repeat the waiting-list notice inside the cooldown window", async () => {
  const socket = new FakeSocket([{ jid: "5511987654321@s.whatsapp.net" }], 1024);
  const queue = new FakeQueue();
  let now = new Date("2026-09-10T10:00:00Z");
  const service = buildService(socket, queue, { now: () => now });

  await service.processGroup(groupJid);
  now = new Date("2026-09-10T20:00:00Z");
  const second = await service.processGroup(groupJid);

  assert.equal(second.waitlistNoticeSent, false);
  assert.equal(queue.enqueued.length, 1);
});

void test("sends the waiting-list notice again once the cooldown has elapsed", async () => {
  const socket = new FakeSocket([{ jid: "5511987654321@s.whatsapp.net" }], 1024);
  const queue = new FakeQueue();
  let now = new Date("2026-09-10T10:00:00Z");
  const service = buildService(socket, queue, { now: () => now });

  await service.processGroup(groupJid);
  now = new Date("2026-09-11T11:00:00Z");
  const second = await service.processGroup(groupJid);

  assert.equal(second.waitlistNoticeSent, true);
  assert.equal(queue.enqueued.length, 2);
});

void test("does not report a participant WhatsApp refused to approve", async () => {
  const socket = new FakeSocket(
    [{ jid: "5511987654321@s.whatsapp.net" }, { jid: "5521999998888@s.whatsapp.net" }],
    100,
    ["5521999998888@s.whatsapp.net"]
  );
  const queue = new FakeQueue();

  const result = await buildService(socket, queue).processGroup(groupJid);

  assert.deepEqual(result.approved, ["5511987654321@s.whatsapp.net"]);
});

void test("uses phone_number for the heuristic but the original jid for the approval", async () => {
  const socket = new FakeSocket([{ jid: "192837465@lid", phone_number: "5511987654321@s.whatsapp.net" }], 100);
  const queue = new FakeQueue();

  const result = await buildService(socket, queue).processGroup(groupJid);

  assert.deepEqual(result.approved, ["5511987654321@s.whatsapp.net"]);
  assert.deepEqual(socket.approvals[0].participants, ["192837465@lid"]);
});

void test("resolves a bare LID through the mapping before judging it", async () => {
  const socket = new FakeSocket([{ jid: "192837465@lid" }], 100);
  const queue = new FakeQueue();
  const service = buildService(socket, queue, {
    resolveJid: async (jid: string) =>
      Promise.resolve(jid === "192837465@lid" ? "5511987654321@s.whatsapp.net" : jid)
  });

  const result = await service.processGroup(groupJid);

  assert.deepEqual(result.approved, ["5511987654321@s.whatsapp.net"]);
  assert.deepEqual(socket.approvals[0].participants, ["192837465@lid"]);
});

void test("leaves an unresolvable LID pending", async () => {
  const socket = new FakeSocket([{ jid: "192837465@lid" }], 100);
  const queue = new FakeQueue();

  const result = await buildService(socket, queue).processGroup(groupJid);

  assert.deepEqual(result.approved, []);
  assert.deepEqual(result.skippedSuspicious, ["192837465@lid"]);
  assert.equal(socket.approvals.length, 0);
});

void test("does nothing when there are no pending requests", async () => {
  const socket = new FakeSocket([], 1024);
  const queue = new FakeQueue();

  const result = await buildService(socket, queue).processGroup(groupJid);

  assert.equal(result.pending, 0);
  assert.equal(socket.approvals.length, 0);
  assert.equal(queue.enqueued.length, 0);
});

void test("does nothing when WhatsApp is not connected", async () => {
  const queue = new FakeQueue();
  const service = new JoinRequestService({
    networkingGroups: [groupJid],
    queue,
    getSocket: () => undefined
  });

  const result = await service.processGroup(groupJid);

  assert.equal(result.pending, 0);
  assert.equal(queue.enqueued.length, 0);
});

void test("processAllGroups keeps going when one group fails", async () => {
  const otherGroup = "120363000000000002@g.us";
  const queue = new FakeQueue();
  const service = new JoinRequestService({
    networkingGroups: [groupJid, otherGroup],
    groupCapacity: 1024,
    queue,
    resolveJid: async (jid: string) => Promise.resolve(jid),
    getSocket: () => ({
      groupMetadata: async (jid: string) => {
        await Promise.resolve();
        if (jid === groupJid) {
          throw new Error("not an admin");
        }
        return { participants: new Array<unknown>(10).fill({}) };
      },
      groupRequestParticipantsList: async () => Promise.resolve([{ jid: "5511987654321@s.whatsapp.net" }]),
      groupRequestParticipantsUpdate: async (_jid: string, participants: string[]) =>
        Promise.resolve(participants.map((participant) => ({ status: "200", jid: participant })))
    })
  });

  const results = await service.processAllGroups();

  assert.equal(results.length, 1);
  assert.equal(results[0].groupJid, otherGroup);
  assert.deepEqual(results[0].approved, ["5511987654321@s.whatsapp.net"]);
});

void test("recognizes WhatsApp's refusal when the bot is not an admin", () => {
  // Baileys surfaces it as a Boom error with data:403 and message "forbidden".
  assert.equal(isForbiddenError({ data: 403, message: "forbidden" }), true);
  assert.equal(isForbiddenError({ data: 403 }), true);
  assert.equal(isForbiddenError(new Error("forbidden")), true);
  assert.equal(isForbiddenError(new Error("timeout")), false);
  assert.equal(isForbiddenError({ data: 500 }), false);
  assert.equal(isForbiddenError(undefined), false);
  assert.equal(isForbiddenError(null), false);
});

void test("a group the bot is not admin of does not stop the other groups", async () => {
  const otherGroup = "120363000000000002@g.us";
  const queue = new FakeQueue();
  const forbidden = Object.assign(new Error("forbidden"), { data: 403 });
  const service = new JoinRequestService({
    networkingGroups: [groupJid, otherGroup],
    groupCapacity: 1024,
    queue,
    resolveJid: async (jid: string) => Promise.resolve(jid),
    getSocket: () => ({
      groupMetadata: async () => Promise.resolve({ participants: new Array<unknown>(10).fill({}) }),
      groupRequestParticipantsList: async (jid: string) => {
        await Promise.resolve();
        if (jid === groupJid) {
          throw forbidden;
        }
        return [{ jid: "5511987654321@s.whatsapp.net" }];
      },
      groupRequestParticipantsUpdate: async (_j: string, participants: string[]) =>
        Promise.resolve(participants.map((participant) => ({ status: "200", jid: participant })))
    })
  });

  const results = await service.processAllGroups();

  assert.equal(results.length, 1);
  assert.deepEqual(results[0].approved, ["5511987654321@s.whatsapp.net"]);
});
