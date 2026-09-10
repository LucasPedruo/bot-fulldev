import assert from "node:assert/strict";
import { test } from "node:test";
import type { EnqueueMessageInput, QueueMessage } from "../queue/queue.types.js";
import { IntroductionBackfillService, type QueueServiceLike } from "./introduction-backfill.service.js";

const eixoGroup = "120363162047367350@g.us";
const eventsGroup = "120363413125773406@g.us";

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
  constructor(public groups: string[] = []) {}

  async getIntroducedGroups(): Promise<string[]> {
    await Promise.resolve();
    return [...this.groups];
  }

  async markIntroduced(groupJid: string): Promise<void> {
    await Promise.resolve();
    if (!this.groups.includes(groupJid)) {
      this.groups.push(groupJid);
    }
  }
}

function buildService(queue: FakeQueue, repository: FakeRepository, groups = [eixoGroup, eventsGroup]) {
  return new IntroductionBackfillService({ groups, queue, repository });
}

void test("introduces into groups the bot was already in", async () => {
  const queue = new FakeQueue();
  const repository = new FakeRepository();

  const introduced = await buildService(queue, repository).run();

  assert.deepEqual(introduced, [eixoGroup, eventsGroup]);
  assert.equal(queue.enqueued.length, 2);
  assert.deepEqual(repository.groups, [eixoGroup, eventsGroup]);
});

void test("does not repeat on the next boot", async () => {
  const queue = new FakeQueue();
  const repository = new FakeRepository();
  const service = buildService(queue, repository);

  await service.run();
  const second = await service.run();

  assert.deepEqual(second, []);
  assert.equal(queue.enqueued.length, 2);
});

void test("skips a group that was already introduced by the join listener", async () => {
  const queue = new FakeQueue();
  const repository = new FakeRepository([eixoGroup]);

  const introduced = await buildService(queue, repository).run();

  assert.deepEqual(introduced, [eventsGroup]);
  assert.equal(queue.enqueued.length, 1);
});

void test("does nothing when no faculty group is configured", async () => {
  const queue = new FakeQueue();
  const repository = new FakeRepository();

  const introduced = await buildService(queue, repository, []).run();

  assert.deepEqual(introduced, []);
  assert.equal(queue.enqueued.length, 0);
});

void test("a backfill running on a deploy waits for the quiet-hours window", async () => {
  const queue = new FakeQueue();

  await buildService(queue, new FakeRepository()).run();

  for (const message of queue.enqueued) {
    assert.notEqual(message.bypassQuietHours, true);
  }
});

void test("marks each group right after its own enqueue", async () => {
  const queue = new FakeQueue();
  const repository = new FakeRepository();
  const failing = new IntroductionBackfillService({
    groups: [eixoGroup, eventsGroup],
    repository,
    queue: {
      enqueue: async (input: EnqueueMessageInput): Promise<QueueMessage> => {
        if (input.destinationGroup === eventsGroup) {
          throw new Error("queue down");
        }
        return queue.enqueue(input);
      }
    }
  });

  await assert.rejects(() => failing.run());

  // The first group must stay marked, so the retry on the next boot does not double-post there.
  assert.deepEqual(repository.groups, [eixoGroup]);
});
