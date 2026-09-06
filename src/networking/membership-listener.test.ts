import assert from "node:assert/strict";
import { test } from "node:test";
import type { EnqueueMessageInput, QueueMessage, TextMessagePayload } from "../queue/queue.types.js";
import { createNetworkingMembershipListener, type GroupParticipantsUpdate, type QueueServiceLike } from "./membership-listener.js";

const networkingGroups = ["120363000000000001@g.us", "120363000000000002@g.us"];

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

function buildUpdate(input: Partial<GroupParticipantsUpdate> & Pick<GroupParticipantsUpdate, "id" | "action">): GroupParticipantsUpdate {
  return {
    author: "5511000000000@s.whatsapp.net",
    participants: [],
    ...input
  };
}

void test("ignores group-participants updates outside the configured networking groups", async () => {
  const queue = new FakeQueue();
  const listener = createNetworkingMembershipListener({ networkingGroups, queue });

  await listener(buildUpdate({ id: "120363999999999999@g.us", action: "add", participants: [{ id: "5511999999999@s.whatsapp.net" }] }));

  assert.deepEqual(queue.enqueued, []);
});

void test("queues a welcome message mentioning every new participant", async () => {
  const queue = new FakeQueue();
  const listener = createNetworkingMembershipListener({ networkingGroups, queue });

  await listener(
    buildUpdate({
      id: networkingGroups[0],
      action: "add",
      participants: [{ id: "5511999999999@s.whatsapp.net" }, { id: "5521988888888@s.whatsapp.net" }]
    })
  );

  assert.equal(queue.enqueued.length, 1);
  assert.equal(queue.enqueued[0].destinationGroup, networkingGroups[0]);
  const payload = queue.enqueued[0].payload as TextMessagePayload;
  assert.deepEqual(payload.mentions, ["5511999999999@s.whatsapp.net", "5521988888888@s.whatsapp.net"]);
  assert.match(payload.text, /@5511999999999/);
  assert.equal(queue.enqueued[0].bypassQuietHours, true);
});

void test("queues an iconic goodbye message when a participant leaves", async () => {
  const queue = new FakeQueue();
  const listener = createNetworkingMembershipListener({ networkingGroups, queue });

  await listener(buildUpdate({ id: networkingGroups[1], action: "remove", participants: [{ id: "5511999999999@s.whatsapp.net" }] }));

  assert.equal(queue.enqueued.length, 1);
  assert.equal(queue.enqueued[0].destinationGroup, networkingGroups[1]);
  const payload = queue.enqueued[0].payload as TextMessagePayload;
  assert.ok(payload.text.length > 0);
  assert.equal(queue.enqueued[0].bypassQuietHours, true);
});

void test("ignores promote/demote/modify actions", async () => {
  const queue = new FakeQueue();
  const listener = createNetworkingMembershipListener({ networkingGroups, queue });

  await listener(buildUpdate({ id: networkingGroups[0], action: "promote", participants: [{ id: "5511999999999@s.whatsapp.net" }] }));

  assert.deepEqual(queue.enqueued, []);
});
