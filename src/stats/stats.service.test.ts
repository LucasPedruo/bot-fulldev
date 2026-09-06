import assert from "node:assert/strict";
import { test } from "node:test";
import { StatsService, type JobRepositoryLike, type QueueRepositoryLike } from "./stats.service.js";

class FakeJobRepository implements JobRepositoryLike {
  constructor(private readonly discovered: number) {}

  async countDiscoveredSince(): Promise<number> {
    await Promise.resolve();
    return this.discovered;
  }
}

class FakeQueueRepository implements QueueRepositoryLike {
  constructor(
    private readonly sentByType: Record<string, number>,
    private readonly failed: number
  ) {}

  async countSentByTypeSince(type: string): Promise<number> {
    await Promise.resolve();
    return this.sentByType[type] ?? 0;
  }

  async countFailedSince(): Promise<number> {
    await Promise.resolve();
    return this.failed;
  }
}

void test("computeDailyStats aggregates all metrics from jobs and the queue", async () => {
  const jobRepository = new FakeJobRepository(7);
  const queueRepository = new FakeQueueRepository({ job: 12, event: 2, event_reminder: 3, networking: 5 }, 4);
  const service = new StatsService(jobRepository, queueRepository);

  const stats = await service.computeDailyStats(new Date("2026-09-06T00:00:00"));

  assert.deepEqual(stats, {
    jobsDiscovered: 7,
    jobsSent: 12,
    eventsDiscovered: 0,
    eventsSent: 2,
    eventRemindersSent: 3,
    networkingMessagesSent: 5,
    failedMessages: 4
  });
});
