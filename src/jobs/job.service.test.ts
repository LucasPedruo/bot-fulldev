import assert from "node:assert/strict";
import { test } from "node:test";
import { JobService, type JobRepositoryLike, type QueueServiceLike } from "./job.service.js";
import type { NormalizedJob, PersistedJob } from "./job.types.js";
import type { JobProvider } from "./providers/provider.interface.js";
import type { EnqueueMessageInput, QueueMessage } from "../queue/queue.types.js";

const job: NormalizedJob = {
  externalId: "job-1",
  source: "Jobicy",
  title: "Frontend Developer",
  company: "Acme",
  location: "Brazil",
  remote: true,
  level: "mid",
  category: "frontend",
  technologies: ["React"],
  url: "https://example.com/job",
  fingerprint: "fingerprint",
  discoveredAt: new Date("2026-09-05T00:00:00.000Z")
};

class FakeProvider implements JobProvider {
  public readonly name = "Fake";

  constructor(private readonly jobs: NormalizedJob[]) {}

  async fetchJobs(): Promise<NormalizedJob[]> {
    await Promise.resolve();
    return this.jobs;
  }
}

class FakeRepository implements JobRepositoryLike {
  public deliveries: Array<{ jobId: string; destinationGroup: string; queueMessageId: string }> = [];

  constructor(private readonly duplicate?: PersistedJob) {}

  async findDuplicate(): Promise<PersistedJob | undefined> {
    await Promise.resolve();
    return this.duplicate;
  }

  async insert(input: NormalizedJob): Promise<PersistedJob> {
    await Promise.resolve();
    return {
      ...input,
      id: "persisted-job-id"
    };
  }

  async createDelivery(input: { jobId: string; destinationGroup: string; queueMessageId: string }): Promise<boolean> {
    await Promise.resolve();
    this.deliveries.push(input);
    return true;
  }
}

class FakeQueue implements QueueServiceLike {
  public enqueued: EnqueueMessageInput[] = [];

  async enqueue(input: EnqueueMessageInput): Promise<QueueMessage> {
    await Promise.resolve();
    this.enqueued.push(input);
    return {
      id: `queued-${this.enqueued.length}`,
      type: input.type,
      destinationGroup: input.destinationGroup,
      payload: input.payload,
      status: "pending",
      priority: input.priority ?? 0,
      scheduledFor: input.scheduledFor ?? new Date(),
      attempts: 0,
      createdAt: new Date(),
      sentAt: null,
      lastError: null,
      processingStartedAt: null
    };
  }
}

void test("JobService queues a new job for both jobs groups", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const service = new JobService([new FakeProvider([job])], repository, queue);

  const result = await service.poll();

  assert.equal(result.discovered, 1);
  assert.equal(result.queued, 2);
  assert.equal(queue.enqueued.length, 2);
  assert.deepEqual(
    queue.enqueued.map((message) => message.destinationGroup),
    ["120363391901542507@g.us", "120363417654610744@g.us"]
  );
  assert.equal(repository.deliveries.length, 2);
});

void test("JobService skips duplicate jobs", async () => {
  const repository = new FakeRepository({
    ...job,
    id: "existing-job-id"
  });
  const queue = new FakeQueue();
  const service = new JobService([new FakeProvider([job])], repository, queue);

  const result = await service.poll();

  assert.equal(result.discovered, 0);
  assert.equal(result.skippedDuplicates, 1);
  assert.equal(queue.enqueued.length, 0);
});
