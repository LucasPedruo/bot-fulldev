import assert from "node:assert/strict";
import { test } from "node:test";
import type { WAMessageKey } from "@whiskeysockets/baileys";
import type { EnqueueMessageInput, QueueMessage, TextMessagePayload } from "../queue/queue.types.js";
import { ModerationService, type ModerationActions, type QueueServiceLike } from "./moderation.service.js";

const groupJid = "120363391901542507@g.us";
const participantJid = "5511987654321@s.whatsapp.net";
const messageKey: WAMessageKey = { remoteJid: groupJid, id: "MSG1", participant: participantJid, fromMe: false };

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

class FakeRepository {
  public strikes = 0;
  public resets: string[] = [];
  public blocks: Array<{ groupJid: string; participantJid: string; blockedUntil: Date; reason: string }> = [];

  constructor(startAt = 0) {
    this.strikes = startAt;
  }

  async addStrike(): Promise<number> {
    await Promise.resolve();
    this.strikes += 1;
    return this.strikes;
  }

  async resetStrikes(_groupJid: string, jid: string): Promise<void> {
    await Promise.resolve();
    this.resets.push(jid);
  }

  async block(input: { groupJid: string; participantJid: string; blockedUntil: Date; reason: string }): Promise<void> {
    await Promise.resolve();
    this.blocks.push(input);
  }
}

class FakeActions implements ModerationActions {
  public deleted: WAMessageKey[] = [];
  public removed: string[] = [];

  async deleteMessage(_groupJid: string, key: WAMessageKey): Promise<void> {
    await Promise.resolve();
    this.deleted.push(key);
  }

  async removeParticipant(_groupJid: string, jid: string): Promise<void> {
    await Promise.resolve();
    this.removed.push(jid);
  }
}

function buildService(queue: FakeQueue, repository: FakeRepository, actions: FakeActions, overrides = {}) {
  return new ModerationService({
    strikeLimit: 3,
    blockDays: 14,
    queue,
    repository,
    actions,
    now: () => new Date("2026-09-10T12:00:00Z"),
    ...overrides
  });
}

function punish(service: ModerationService) {
  return service.punish({ groupJid, participantJid, messageKey, reason: "papo furado" });
}

void test("deletes the message and warns on the first strike", async () => {
  const queue = new FakeQueue();
  const actions = new FakeActions();

  const outcome = await punish(buildService(queue, new FakeRepository(), actions));

  assert.equal(outcome.strikes, 1);
  assert.equal(outcome.removed, false);
  assert.deepEqual(actions.deleted, [messageKey]);
  assert.deepEqual(actions.removed, []);
  const payload = queue.enqueued[0].payload as TextMessagePayload;
  assert.match(payload.text, /1\/3/);
  assert.deepEqual(payload.mentions, [participantJid]);
});

void test("the warning says why the message disappeared", async () => {
  const queue = new FakeQueue();

  await punish(buildService(queue, new FakeRepository(), new FakeActions()));

  const text = (queue.enqueued[0].payload as TextMessagePayload).text;
  assert.match(text, /divulgação de vagas/i);
  assert.match(text, /removida/i);
});

void test("counts up to the limit without removing", async () => {
  const queue = new FakeQueue();
  const actions = new FakeActions();

  const outcome = await punish(buildService(queue, new FakeRepository(1), actions));

  assert.equal(outcome.strikes, 2);
  assert.equal(outcome.removed, false);
  assert.match((queue.enqueued[0].payload as TextMessagePayload).text, /2\/3/);
  assert.deepEqual(actions.removed, []);
});

void test("removes and blocks on the third strike", async () => {
  const queue = new FakeQueue();
  const repository = new FakeRepository(2);
  const actions = new FakeActions();

  const outcome = await punish(buildService(queue, repository, actions));

  assert.equal(outcome.strikes, 3);
  assert.equal(outcome.removed, true);
  assert.deepEqual(actions.removed, [participantJid]);
  assert.equal(repository.blocks.length, 1);
  // 14 days after the fixed clock above.
  assert.equal(repository.blocks[0].blockedUntil.toISOString(), "2026-09-24T12:00:00.000Z");
  assert.equal(repository.blocks[0].reason, "papo furado");
});

void test("announces the removal before removing, while the person can still read it", async () => {
  const queue = new FakeQueue();
  const actions = new FakeActions();

  await punish(buildService(queue, new FakeRepository(2), actions));

  const text = (queue.enqueued[0].payload as TextMessagePayload).text;
  assert.match(text, /3\/3/);
  assert.match(text, /14 dias/);
});

void test("clears the strikes so a returning member starts over", async () => {
  const queue = new FakeQueue();
  const repository = new FakeRepository(2);

  await punish(buildService(queue, repository, new FakeActions()));

  // Otherwise they would be removed again on their first message back after the block.
  assert.deepEqual(repository.resets, [participantJid]);
});

void test("the message is deleted even on the removal path", async () => {
  const actions = new FakeActions();

  await punish(buildService(new FakeQueue(), new FakeRepository(2), actions));

  assert.deepEqual(actions.deleted, [messageKey]);
});

void test("warnings do not wait out quiet hours", async () => {
  const queue = new FakeQueue();

  await punish(buildService(queue, new FakeRepository(), new FakeActions()));

  // The warning explains a message that just vanished; arriving next morning it explains nothing.
  assert.equal(queue.enqueued[0].bypassQuietHours, true);
});

void test("honours a different strike limit", async () => {
  const queue = new FakeQueue();
  const actions = new FakeActions();

  const outcome = await punish(buildService(queue, new FakeRepository(), actions, { strikeLimit: 1 }));

  assert.equal(outcome.removed, true);
  assert.deepEqual(actions.removed, [participantJid]);
});
