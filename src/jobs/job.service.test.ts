import assert from "node:assert/strict";
import { test } from "node:test";
import { env } from "../config/env.js";
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

  constructor(
    private readonly duplicate?: PersistedJob,
    private readonly discoveredToday = 0
  ) {}

  async countDiscoveredSince(): Promise<number> {
    await Promise.resolve();
    return this.discoveredToday;
  }

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

void test("JobService also sends internship/junior jobs to the faculty group", async () => {
  const juniorJob: NormalizedJob = { ...job, level: "junior" };
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const service = new JobService([new FakeProvider([juniorJob])], repository, queue);

  const result = await service.poll();

  assert.equal(result.queued, 3);
  assert.deepEqual(
    queue.enqueued.map((message) => message.destinationGroup),
    ["120363391901542507@g.us", "120363417654610744@g.us", "120363401995520356@g.us"]
  );
});

void test("JobService never sends mid/senior/unclassified jobs to the faculty group - its audience is entry-level", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const service = new JobService([new FakeProvider([{ ...job, level: "mid" }, { ...job, level: undefined, externalId: "job-2" }])], repository, queue);

  const result = await service.poll();

  assert.equal(result.queued, 4);
  assert.ok(!queue.enqueued.some((message) => message.destinationGroup === "120363401995520356@g.us"));
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

void test("JobService skips polling entirely once the daily limit is already reached", async () => {
  const repository = new FakeRepository(undefined, env.JOBS_MAX_PER_DAY);
  const queue = new FakeQueue();
  const service = new JobService([new FakeProvider([job])], repository, queue);

  const result = await service.poll();

  assert.equal(result.fetched, 0);
  assert.equal(result.discovered, 0);
  assert.equal(queue.enqueued.length, 0);
});

void test("JobService stops enqueueing once the daily limit is reached mid-poll", async () => {
  const secondJob: NormalizedJob = { ...job, externalId: "job-2", fingerprint: "fingerprint-2" };
  const repository = new FakeRepository(undefined, env.JOBS_MAX_PER_DAY - 1);
  const queue = new FakeQueue();
  const service = new JobService([new FakeProvider([job, secondJob])], repository, queue);

  const result = await service.poll();

  assert.equal(result.fetched, 2);
  assert.equal(result.discovered, 1);
  assert.equal(queue.enqueued.length, 2);
});
