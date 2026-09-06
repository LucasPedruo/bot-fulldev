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
  const repository = new FakeRepository(new Date(dayTime.getTime() - 121 * 60_000));
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
  const repository = new FakeRepository(new Date(dayTime.getTime() - 121 * 60_000));
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
  const repository = new FakeRepository(new Date(dayTime.getTime() - 121 * 60_000));
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

void test("posts a meme when the meme roll hits and the provider returns content", async () => {
  const repository = new FakeRepository(new Date(dayTime.getTime() - 121 * 60_000));
  const queue = new FakeQueue();
  const service = new NetworkingIdleService(
    repository,
    queue,
    () => dayTime,
    [group],
    () => 0.0,
    async () => {
      await Promise.resolve();
      throw new Error("newsProvider should not be called");
    },
    {
      pickMemeContent: async () => {
        await Promise.resolve();
        return { filename: "bug-in-prod.jpg", caption: "Sexta-feira" };
      }
    }
  );

  const result = await service.checkAndPost();

  assert.deepEqual(result, { posted: 1 });
  assert.equal(queue.enqueued.length, 1);
  assert.deepEqual(queue.enqueued[0].payload, { image: { filename: "bug-in-prod.jpg", caption: "Sexta-feira" } });
});

void test("posts a direct question mentioning a real participant when that roll hits", async () => {
  const repository = new FakeRepository(new Date(dayTime.getTime() - 121 * 60_000));
  const queue = new FakeQueue();
  const botJid = "5500000000000@s.whatsapp.net";
  const participantJid = "5511999999999@s.whatsapp.net";
  const service = new NetworkingIdleService(
    repository,
    queue,
    () => dayTime,
    [group],
    () => 0.0,
    async () => {
      await Promise.resolve();
      throw new Error("newsProvider should not be called");
    },
    {
      pickMemeContent: async () => {
        await Promise.resolve();
        return undefined;
      }
    },
    async () => {
      await Promise.resolve();
      return [botJid, participantJid];
    },
    () => [botJid]
  );

  const result = await service.checkAndPost();

  assert.deepEqual(result, { posted: 1 });
  assert.equal(queue.enqueued.length, 1);
  const payload = queue.enqueued[0].payload as { text: string; mentions: string[] };
  assert.deepEqual(payload.mentions, [participantJid]);
  assert.match(payload.text, /@5511999999999/);
});

void test("falls back to normal idle content when listing participants fails for the direct question", async () => {
  const repository = new FakeRepository(new Date(dayTime.getTime() - 121 * 60_000));
  const queue = new FakeQueue();
  // Sequence covers the meme roll (skip), the direct-question roll (hit, but listing fails below),
  // and the news roll (skip) - falling all the way through to the plain template content.
  const rolls = [0.99, 0.0, 0.99];
  let rollIndex = 0;
  const service = new NetworkingIdleService(
    repository,
    queue,
    () => dayTime,
    [group],
    () => rolls[Math.min(rollIndex++, rolls.length - 1)],
    async () => {
      await Promise.resolve();
      throw new Error("newsProvider should not be called");
    },
    {
      pickMemeContent: async () => {
        await Promise.resolve();
        return undefined;
      }
    },
    async () => {
      await Promise.resolve();
      throw new Error("not connected");
    },
    () => []
  );

  const result = await service.checkAndPost();

  assert.deepEqual(result, { posted: 1 });
  assert.equal(queue.enqueued.length, 1);
  const payload = queue.enqueued[0].payload as { text?: string; mentions?: string[] };
  assert.equal(payload.mentions, undefined);
});

void test("falls back past the meme check when the meme provider returns nothing", async () => {
  const repository = new FakeRepository(new Date(dayTime.getTime() - 121 * 60_000));
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
    },
    {
      pickMemeContent: async () => {
        await Promise.resolve();
        return undefined;
      }
    }
  );

  await service.checkAndPost();

  const payload = queue.enqueued[0].payload as { text: string };
  assert.match(payload.text, /Why TypeScript Rocks/);
});
