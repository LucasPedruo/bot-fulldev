import assert from "node:assert/strict";
import { test } from "node:test";
import { NetworkingIdleService, type NetworkingRepositoryLike, type QueueServiceLike } from "./networking-idle.service.js";
import type { EnqueueMessageInput, QueueMessage } from "../queue/queue.types.js";

const group = "120363000000000001@g.us";

class FakeRepository implements NetworkingRepositoryLike {
  public touched: Array<{ groupJid: string; at: Date }> = [];
  public recorded: Array<{ groupJid: string; type: string; content: string }> = [];

  constructor(
    private readonly lastMessageAt?: Date,
    private readonly recentlyUsed: string[] = []
  ) {}

  async getLastMessageAt(): Promise<Date | undefined> {
    await Promise.resolve();
    return this.lastMessageAt;
  }

  async touchActivity(groupJid: string, at: Date = new Date()): Promise<void> {
    await Promise.resolve();
    this.touched.push({ groupJid, at });
  }

  async recordTopicUsed(input: { groupJid: string; type: string; content: string }): Promise<void> {
    await Promise.resolve();
    this.recorded.push(input);
  }

  async getRecentlyUsedContent(): Promise<string[]> {
    await Promise.resolve();
    return this.recentlyUsed;
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

const dayTime = new Date("2026-09-05T15:00:00");

void test("does not post anything during quiet hours", async () => {
  const repository = new FakeRepository(new Date("2026-09-05T00:00:00"));
  const queue = new FakeQueue();
  const service = new NetworkingIdleService(
    repository,
    queue,
    () => new Date("2026-09-05T03:00:00"),
    [group]
  );

  const result = await service.checkAndPost();

  assert.deepEqual(result, { posted: 0 });
  assert.deepEqual(queue.enqueued, []);
});

void test("does not post when the group has been active recently", async () => {
  const repository = new FakeRepository(new Date(dayTime.getTime() - 5 * 60_000));
  const queue = new FakeQueue();
  const service = new NetworkingIdleService(repository, queue, () => dayTime, [group]);

  const result = await service.checkAndPost();

  assert.deepEqual(result, { posted: 0 });
  assert.deepEqual(queue.enqueued, []);
});

void test("does not post when the group has no tracked activity yet", async () => {
  const repository = new FakeRepository(undefined);
  const queue = new FakeQueue();
  const service = new NetworkingIdleService(repository, queue, () => dayTime, [group]);

  const result = await service.checkAndPost();

  assert.deepEqual(result, { posted: 0 });
});

void test("posts a template topic and resets the clock when idle past the threshold", async () => {
  const repository = new FakeRepository(new Date(dayTime.getTime() - 61 * 60_000));
  const queue = new FakeQueue();
  const service = new NetworkingIdleService(
    repository,
    queue,
    () => dayTime,
    [group],
    () => 0.99, // above NEWS_CHANCE, so no news branch
    async () => {
      await Promise.resolve();
      throw new Error("newsProvider should not be called");
    }
  );

  const result = await service.checkAndPost();

  assert.deepEqual(result, { posted: 1 });
  assert.equal(queue.enqueued.length, 1);
  assert.equal(queue.enqueued[0].destinationGroup, group);
  assert.equal(repository.touched.length, 1);
  assert.equal(repository.touched[0].groupJid, group);
  assert.equal(repository.recorded.length, 1);
});

void test("posts real news when the news roll hits and the provider returns an article", async () => {
  const repository = new FakeRepository(new Date(dayTime.getTime() - 61 * 60_000));
  const queue = new FakeQueue();
  const service = new NetworkingIdleService(
    repository,
    queue,
    () => dayTime,
    [group],
    () => 0.0,
    async () => {
      await Promise.resolve();
      return { title: "Why TypeScript Rocks", url: "https://dev.to/example" };
    }
  );

  await service.checkAndPost();

  assert.equal(queue.enqueued.length, 1);
  const payload = queue.enqueued[0].payload as { text: string };
  assert.match(payload.text, /Why TypeScript Rocks/);
  assert.equal(repository.recorded[0].type, "news");
});

void test("falls back to a template topic when the news provider fails", async () => {
  const repository = new FakeRepository(new Date(dayTime.getTime() - 61 * 60_000));
  const queue = new FakeQueue();
  const service = new NetworkingIdleService(
    repository,
    queue,
    () => dayTime,
    [group],
    () => 0.0,
    async () => {
      await Promise.resolve();
      return undefined;
    }
  );

  const result = await service.checkAndPost();

  assert.deepEqual(result, { posted: 1 });
  assert.equal(queue.enqueued.length, 1);
  assert.notEqual(repository.recorded[0].type, "news");
});
