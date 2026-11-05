import assert from "node:assert/strict";
import { test } from "node:test";
import type { WAMessageKey } from "@whiskeysockets/baileys";
import { env } from "../config/env.js";
import type { EnqueueMessageInput, QueueMessage, TextMessagePayload } from "../queue/queue.types.js";
import { AmbientEngagementService, type AmbientEngagementRepositoryLike, type QueueServiceLike } from "./ambient-engagement.service.js";

const group = "120363000000000001@g.us";
const messageKey: WAMessageKey = { remoteJid: group, fromMe: false, id: "ABC123" };
const fixedNow = new Date("2026-09-05T15:00:00");

class FakeRepository implements AmbientEngagementRepositoryLike {
  public replies: Array<{ groupJid: string; at: Date }> = [];
  public mutedUntil: Array<{ groupJid: string; until: Date }> = [];
  public reactionTouches: Array<{ groupJid: string; at: Date }> = [];

  constructor(
    private readonly ambientReplyMuteUntil: Date | undefined = undefined,
    private readonly recentReplyCount = 0,
    private readonly lastAmbientReactionAt: Date | undefined = undefined
  ) {}

  async getAmbientReplyMuteUntil(): Promise<Date | undefined> {
    await Promise.resolve();
    return this.ambientReplyMuteUntil;
  }

  async setAmbientReplyMuteUntil(groupJid: string, until: Date): Promise<void> {
    await Promise.resolve();
    this.mutedUntil.push({ groupJid, until });
  }

  async countRecentAmbientReplies(): Promise<number> {
    await Promise.resolve();
    return this.recentReplyCount;
  }

  async recordAmbientReply(groupJid: string, at: Date): Promise<void> {
    await Promise.resolve();
    this.replies.push({ groupJid, at });
  }

  async getLastAmbientReactionAt(): Promise<Date | undefined> {
    await Promise.resolve();
    return this.lastAmbientReactionAt;
  }

  async touchAmbientReaction(groupJid: string, at: Date): Promise<void> {
    await Promise.resolve();
    this.reactionTouches.push({ groupJid, at });
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

class FakeReactionSender {
  public sent: Array<{ groupJid: string; messageKey: WAMessageKey; emoji: string }> = [];

  send = async (groupJid: string, key: WAMessageKey, emoji: string): Promise<void> => {
    await Promise.resolve();
    this.sent.push({ groupJid, messageKey: key, emoji });
  };
}

void test("does nothing when the feature is disabled", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const reactionSender = new FakeReactionSender();
  const service = new AmbientEngagementService(
    repository,
    queue,
    reactionSender.send,
    () => fixedNow,
    () => 0,
    () => Promise.resolve("comentário"),
    () => Promise.resolve("🎉"),
    false
  );

  await service.handleMessage(group, messageKey, "consegui minha primeira vaga!");

  assert.deepEqual(reactionSender.sent, []);
  assert.deepEqual(queue.enqueued, []);
});

void test("ignores messages with no text", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const reactionSender = new FakeReactionSender();
  const service = new AmbientEngagementService(
    repository,
    queue,
    reactionSender.send,
    () => fixedNow,
    () => 0,
    () => Promise.resolve("comentário"),
    () => Promise.resolve("🎉"),
    true
  );

  await service.handleMessage(group, messageKey, undefined);

  assert.deepEqual(reactionSender.sent, []);
  assert.deepEqual(queue.enqueued, []);
});

void test("reacts when the roll clears the reaction probability and no recent reaction exists", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const reactionSender = new FakeReactionSender();
  const rolls = [0, 1]; // first roll (reaction) succeeds, second roll (reply) fails
  const service = new AmbientEngagementService(
    repository,
    queue,
    reactionSender.send,
    () => fixedNow,
    () => rolls.shift() ?? 1,
    () => Promise.resolve("comentário"),
    () => Promise.resolve("🎉"),
    true
  );

  await service.handleMessage(group, messageKey, "consegui minha primeira vaga!");

  assert.deepEqual(reactionSender.sent, [{ groupJid: group, messageKey, emoji: "🎉" }]);
  assert.equal(repository.reactionTouches.length, 1);
  assert.deepEqual(queue.enqueued, []);
});

void test("skips the reaction when the min gap since the last one has not elapsed", async () => {
  const repository = new FakeRepository(undefined, 0, new Date(fixedNow.getTime() - 60_000));
  const queue = new FakeQueue();
  const reactionSender = new FakeReactionSender();
  const service = new AmbientEngagementService(
    repository,
    queue,
    reactionSender.send,
    () => fixedNow,
    () => 0,
    () => Promise.resolve("comentário"),
    () => Promise.resolve("🎉"),
    true
  );

  await service.handleMessage(group, messageKey, "consegui minha primeira vaga!");

  assert.deepEqual(reactionSender.sent, []);
});

void test("skips the reaction when the picker finds nothing worth reacting to", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const reactionSender = new FakeReactionSender();
  const service = new AmbientEngagementService(
    repository,
    queue,
    reactionSender.send,
    () => fixedNow,
    () => 0,
    () => Promise.resolve("comentário"),
    () => Promise.resolve(undefined),
    true
  );

  await service.handleMessage(group, messageKey, "bom dia pessoal");

  assert.deepEqual(reactionSender.sent, []);
});

void test("replies when the roll clears the reply probability and under the hourly cap", async () => {
  const repository = new FakeRepository(undefined, env.NETWORKING_AMBIENT_REPLY_MAX_PER_HOUR - 1);
  const queue = new FakeQueue();
  const reactionSender = new FakeReactionSender();
  const rolls = [1, 0]; // first roll (reaction) fails, second roll (reply) succeeds
  const service = new AmbientEngagementService(
    repository,
    queue,
    reactionSender.send,
    () => fixedNow,
    () => rolls.shift() ?? 1,
    () => Promise.resolve("comentário"),
    () => Promise.resolve("🎉"),
    true
  );

  await service.handleMessage(group, messageKey, "qual editor vocês usam?");

  assert.equal(queue.enqueued.length, 1);
  assert.equal(queue.enqueued[0].destinationGroup, group);
  assert.equal((queue.enqueued[0].payload as TextMessagePayload).text, "comentário");
  assert.equal(repository.replies.length, 1);
  assert.equal(repository.mutedUntil.length, 0);
});

void test("stays silent while the ambient reply mute is active", async () => {
  const repository = new FakeRepository(new Date(fixedNow.getTime() + 60_000));
  const queue = new FakeQueue();
  const reactionSender = new FakeReactionSender();
  const service = new AmbientEngagementService(
    repository,
    queue,
    reactionSender.send,
    () => fixedNow,
    () => 0,
    () => Promise.resolve("comentário"),
    () => Promise.resolve(undefined),
    true
  );

  await service.handleMessage(group, messageKey, "qual editor vocês usam?");

  assert.deepEqual(queue.enqueued, []);
});

void test("goes quiet without a cooldown announcement once the hourly reply cap is hit", async () => {
  const repository = new FakeRepository(undefined, env.NETWORKING_AMBIENT_REPLY_MAX_PER_HOUR);
  const queue = new FakeQueue();
  const reactionSender = new FakeReactionSender();
  const service = new AmbientEngagementService(
    repository,
    queue,
    reactionSender.send,
    () => fixedNow,
    () => 0,
    () => Promise.resolve("comentário"),
    () => Promise.resolve(undefined),
    true
  );

  await service.handleMessage(group, messageKey, "qual editor vocês usam?");

  assert.deepEqual(queue.enqueued, []);
  assert.equal(repository.mutedUntil.length, 1);
  assert.equal(repository.mutedUntil[0].groupJid, group);
  assert.equal(
    repository.mutedUntil[0].until.getTime(),
    fixedNow.getTime() + env.NETWORKING_AMBIENT_REPLY_COOLDOWN_HOURS * 60 * 60_000
  );
});
