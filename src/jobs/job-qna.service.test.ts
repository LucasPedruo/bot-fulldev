import assert from "node:assert/strict";
import { test } from "node:test";
import type { EnqueueMessageInput, QueueMessage } from "../queue/queue.types.js";
import { JobQnaService, type JobRepositoryLike, type QueueServiceLike } from "./job-qna.service.js";
import type { JobQueryFilter } from "./job.repository.js";
import type { PersistedJob } from "./job.types.js";

class FakeRepository implements JobRepositoryLike {
  public calls: JobQueryFilter[] = [];

  constructor(private readonly results: PersistedJob[] = []) {}

  async query(filter: JobQueryFilter): Promise<PersistedJob[]> {
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

const group = "120363391901542507@g.us";

void test("handleMessage answers with the most recent jobs when the message has no criteria", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const service = new JobQnaService(repository, queue);

  await service.handleMessage(group, "e aí, tem vaga?");

  assert.deepEqual(repository.calls, [{ level: undefined, category: undefined }]);
  assert.equal(queue.enqueued.length, 1);
  assert.equal(queue.enqueued[0].type, "job");
});

void test("handleMessage queries by level and category and replies in the jobs group", async () => {
  const repository = new FakeRepository([]);
  const queue = new FakeQueue();
  const service = new JobQnaService(repository, queue);

  await service.handleMessage(group, "me diga vagas de junior frontend");

  assert.deepEqual(repository.calls, [{ level: "junior", category: "frontend" }]);
  assert.equal(queue.enqueued.length, 1);
  assert.equal(queue.enqueued[0].destinationGroup, group);
});
