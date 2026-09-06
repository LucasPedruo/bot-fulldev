import assert from "node:assert/strict";
import { test } from "node:test";
import { env } from "../config/env.js";
import type { EnqueueMessageInput, QueueMessage, TextMessagePayload } from "../queue/queue.types.js";
import { MentionReplyService, type MentionRepositoryLike, type QueueServiceLike } from "./mention-reply.service.js";

const group = "120363000000000001@g.us";
const sender = "5511999999999@s.whatsapp.net";
const fixedNow = new Date("2026-09-05T15:00:00");

class FakeRepository implements MentionRepositoryLike {
  public mutedUntil: Array<{ groupJid: string; until: Date }> = [];
  public replies: Array<{ groupJid: string; at: Date }> = [];

  constructor(
    private readonly muteUntil: Date | undefined,
    private readonly recentCount: number
  ) {}

  async getMentionMuteUntil(): Promise<Date | undefined> {
    await Promise.resolve();
    return this.muteUntil;
  }

  async setMentionMuteUntil(groupJid: string, until: Date): Promise<void> {
    await Promise.resolve();
    this.mutedUntil.push({ groupJid, until });
  }

  async countRecentMentionReplies(): Promise<number> {
    await Promise.resolve();
    return this.recentCount;
  }

  async recordMentionReply(groupJid: string, at: Date): Promise<void> {
    await Promise.resolve();
    this.replies.push({ groupJid, at });
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

void test("stays completely silent while muted", async () => {
  const repository = new FakeRepository(new Date(fixedNow.getTime() + 60_000), 0);
  const queue = new FakeQueue();
  const service = new MentionReplyService(repository, queue, () => fixedNow);

  await service.handleMention(group, sender);

  assert.deepEqual(queue.enqueued, []);
  assert.deepEqual(repository.replies, []);
});

void test("replies normally when under the hourly limit and not muted", async () => {
  const repository = new FakeRepository(undefined, env.NETWORKING_MENTION_MAX_PER_HOUR - 1);
  const queue = new FakeQueue();
  const service = new MentionReplyService(repository, queue, () => fixedNow);

  await service.handleMention(group, sender);

  assert.equal(queue.enqueued.length, 1);
  assert.equal(queue.enqueued[0].destinationGroup, group);
  assert.deepEqual((queue.enqueued[0].payload as TextMessagePayload).mentions, [sender]);
  assert.equal(repository.mutedUntil.length, 0);
  assert.equal(repository.replies.length, 1);
});

void test("mutes the group and replies with a cooldown message once the hourly limit is reached", async () => {
  const repository = new FakeRepository(undefined, env.NETWORKING_MENTION_MAX_PER_HOUR);
  const queue = new FakeQueue();
  const service = new MentionReplyService(repository, queue, () => fixedNow);

  await service.handleMention(group, sender);

  assert.equal(queue.enqueued.length, 1);
  const payload = queue.enqueued[0].payload as TextMessagePayload;
  assert.match(payload.text, new RegExp(`${env.NETWORKING_MENTION_COOLDOWN_HOURS}h`));
  assert.equal(repository.mutedUntil.length, 1);
  assert.equal(repository.mutedUntil[0].groupJid, group);
  assert.equal(
    repository.mutedUntil[0].until.getTime(),
    fixedNow.getTime() + env.NETWORKING_MENTION_COOLDOWN_HOURS * 60 * 60_000
  );
});

void test("expired mute does not block a reply", async () => {
  const repository = new FakeRepository(new Date(fixedNow.getTime() - 60_000), 0);
  const queue = new FakeQueue();
  const service = new MentionReplyService(repository, queue, () => fixedNow);

  await service.handleMention(group, sender);

  assert.equal(queue.enqueued.length, 1);
});

void test("uses the AI-generated reply when the generator returns text", async () => {
  const repository = new FakeRepository(undefined, 0);
  const queue = new FakeQueue();
  const service = new MentionReplyService(repository, queue, () => fixedNow, async (messageText) => {
    await Promise.resolve();
    return `IA respondeu sobre: ${messageText ?? "nada"}`;
  });

  await service.handleMention(group, sender, "qual editor vocês usam?");

  const payload = queue.enqueued[0].payload as TextMessagePayload;
  assert.match(payload.text, /IA respondeu sobre: qual editor vocês usam\?/);
});

void test("falls back to the template reply when the AI generator returns nothing", async () => {
  const repository = new FakeRepository(undefined, 0);
  const queue = new FakeQueue();
  const service = new MentionReplyService(repository, queue, () => fixedNow, async () => {
    await Promise.resolve();
    return undefined;
  });

  await service.handleMention(group, sender);

  assert.equal(queue.enqueued.length, 1);
  const payload = queue.enqueued[0].payload as TextMessagePayload;
  assert.ok(payload.text.length > 0);
});

void test("never calls the AI generator once the hourly limit is reached", async () => {
  const repository = new FakeRepository(undefined, env.NETWORKING_MENTION_MAX_PER_HOUR);
  const queue = new FakeQueue();
  const service = new MentionReplyService(repository, queue, () => fixedNow, async () => {
    await Promise.resolve();
    throw new Error("AI generator should not be called during cooldown");
  });

  await service.handleMention(group, sender);

  assert.equal(queue.enqueued.length, 1);
  const payload = queue.enqueued[0].payload as TextMessagePayload;
  assert.match(payload.text, new RegExp(`${env.NETWORKING_MENTION_COOLDOWN_HOURS}h`));
});
