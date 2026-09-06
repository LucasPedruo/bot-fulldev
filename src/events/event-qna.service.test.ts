import assert from "node:assert/strict";
import { test } from "node:test";
import type { EnqueueMessageInput, QueueMessage } from "../queue/queue.types.js";
import { EventQnaService, type EventRepositoryLike, type QueueServiceLike } from "./event-qna.service.js";
import type { EventQueryFilter } from "./event.repository.js";
import type { PersistedEvent } from "./event.types.js";

class FakeRepository implements EventRepositoryLike {
  public calls: EventQueryFilter[] = [];

  constructor(private readonly results: PersistedEvent[] = []) {}

  async query(filter: EventQueryFilter): Promise<PersistedEvent[]> {
    await Promise.resolve();
    this.calls.push(filter);
    return this.results;
  }
}

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
      priority: 0,
      bypassQuietHours: false,
      scheduledFor: new Date(),
      attempts: 0,
      createdAt: new Date(),
      sentAt: null,
      lastError: null,
      processingStartedAt: null
    };
  }
}

const group = "120363429019612420@g.us";

void test("handleMessage ignores a message that isn't an event question", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const service = new EventQnaService(repository, queue);

  const handled = await service.handleMessage(group, "bom dia pessoal");

  assert.equal(handled, false);
  assert.equal(queue.enqueued.length, 0);
});

void test("handleMessage queries by month and replies in the events group", async () => {
  const repository = new FakeRepository([]);
  const queue = new FakeQueue();
  const service = new EventQnaService(repository, queue, () => new Date(2026, 8, 6));

  const handled = await service.handleMessage(group, "tem evento em outubro?");

  assert.equal(handled, true);
  assert.deepEqual(repository.calls, [{ month: 9, year: 2026, locationContains: undefined }]);
  assert.equal(queue.enqueued.length, 1);
  assert.equal(queue.enqueued[0].destinationGroup, group);
  assert.equal(queue.enqueued[0].type, "event");
});

void test("handleMessage queries by location", async () => {
  const repository = new FakeRepository([]);
  const queue = new FakeQueue();
  const service = new EventQnaService(repository, queue);

  await service.handleMessage(group, "tem algum evento em Recife?");

  assert.deepEqual(repository.calls, [{ month: undefined, year: undefined, locationContains: "Recife" }]);
});
