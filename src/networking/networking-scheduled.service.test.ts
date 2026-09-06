import assert from "node:assert/strict";
import { test } from "node:test";
import type { EnqueueMessageInput, QueueMessage, TextMessagePayload } from "../queue/queue.types.js";
import type { DailyStats } from "../stats/stats.service.js";
import {
  NetworkingScheduledService,
  type NetworkingRepositoryLike,
  type QueueServiceLike,
  type StatsServiceLike
} from "./networking-scheduled.service.js";

const group = "120363000000000001@g.us";
const botJid = "551100000000:1@s.whatsapp.net";
const botLid = "999888777:1@lid";
const fixedNow = new Date("2026-09-08T08:00:00"); // a Tuesday

class FakeRepository implements NetworkingRepositoryLike {
  public recorded: Array<{ groupJid: string; participantJid: string; slot: string }> = [];

  constructor(
    private readonly recentSpotlightJids: string[] = [],
    private readonly messagesToday = 0,
    private readonly membership = { joined: 0, left: 0 }
  ) {}

  async getRecentSpotlightJids(): Promise<string[]> {
    await Promise.resolve();
    return this.recentSpotlightJids;
  }

  async recordSpotlight(input: { groupJid: string; participantJid: string; slot: string }): Promise<void> {
    await Promise.resolve();
    this.recorded.push(input);
  }

  async getMessagesToday(): Promise<number> {
    await Promise.resolve();
    return this.messagesToday;
  }

  async countMembershipEventsToday(): Promise<{ joined: number; left: number }> {
    await Promise.resolve();
    return this.membership;
  }
}

const emptyDailyStats: DailyStats = {
  jobsDiscovered: 0,
  jobsSent: 0,
  eventsDiscovered: 0,
  eventsSent: 0,
  eventRemindersSent: 0,
  networkingMessagesSent: 0,
  failedMessages: 0
};

class FakeStatsService implements StatsServiceLike {
  constructor(private readonly stats: DailyStats = emptyDailyStats) {}

  async computeDailyStats(): Promise<DailyStats> {
    await Promise.resolve();
    return this.stats;
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

void test("postSpotlight excludes the bot and mentions the chosen participant", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const service = new NetworkingScheduledService(
    repository,
    new FakeStatsService(),
    queue,
    () => fixedNow,
    [group],
    async () => {
      await Promise.resolve();
      return [botJid, botLid, "5511999999999@s.whatsapp.net"];
    },
    () => [botJid, botLid]
  );

  await service.postSpotlight("morning");

  assert.equal(queue.enqueued.length, 1);
  const payload = queue.enqueued[0].payload as TextMessagePayload;
  assert.deepEqual(payload.mentions, ["5511999999999@s.whatsapp.net"]);
  assert.match(payload.text, /@5511999999999/);
  assert.equal(repository.recorded.length, 1);
  assert.equal(repository.recorded[0].participantJid, "5511999999999@s.whatsapp.net");
});

void test("postSpotlight excludes participants spotlighted in the last 24h", async () => {
  const repository = new FakeRepository(["5511111111111@s.whatsapp.net"]);
  const queue = new FakeQueue();
  const service = new NetworkingScheduledService(
    repository,
    new FakeStatsService(),
    queue,
    () => fixedNow,
    [group],
    async () => {
      await Promise.resolve();
      return [botJid, "5511111111111@s.whatsapp.net", "5511222222222@s.whatsapp.net"];
    },
    () => [botJid]
  );

  await service.postSpotlight("lunch");

  const payload = queue.enqueued[0].payload as TextMessagePayload;
  assert.deepEqual(payload.mentions, ["5511222222222@s.whatsapp.net"]);
});

void test("postSpotlight falls back to the full pool when everyone was recently spotlighted", async () => {
  const onlyParticipant = "5511111111111@s.whatsapp.net";
  const repository = new FakeRepository([onlyParticipant]);
  const queue = new FakeQueue();
  const service = new NetworkingScheduledService(
    repository,
    new FakeStatsService(),
    queue,
    () => fixedNow,
    [group],
    async () => {
      await Promise.resolve();
      return [botJid, onlyParticipant];
    },
    () => [botJid]
  );

  await service.postSpotlight("night");

  assert.equal(queue.enqueued.length, 1);
  const payload = queue.enqueued[0].payload as TextMessagePayload;
  assert.deepEqual(payload.mentions, [onlyParticipant]);
});

void test("postSpotlight skips a group with no eligible participants", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const service = new NetworkingScheduledService(
    repository,
    new FakeStatsService(),
    queue,
    () => fixedNow,
    [group],
    async () => {
      await Promise.resolve();
      return [botJid];
    },
    () => [botJid]
  );

  await service.postSpotlight("morning");

  assert.deepEqual(queue.enqueued, []);
  assert.deepEqual(repository.recorded, []);
});

void test("postSpotlight logs and continues when listing participants fails", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const service = new NetworkingScheduledService(
    repository,
    new FakeStatsService(),
    queue,
    () => fixedNow,
    [group],
    async () => {
      await Promise.resolve();
      throw new Error("not connected");
    },
    () => [botJid]
  );

  await service.postSpotlight("morning");

  assert.deepEqual(queue.enqueued, []);
});

void test("postDailySummary combines stats, messages, and membership counts", async () => {
  const repository = new FakeRepository([], 42, { joined: 2, left: 1 });
  const queue = new FakeQueue();
  const service = new NetworkingScheduledService(
    repository,
    new FakeStatsService({ ...emptyDailyStats, jobsDiscovered: 3, jobsSent: 6, failedMessages: 2 }),
    queue,
    () => fixedNow,
    [group],
    async () => {
      await Promise.resolve();
      return [];
    },
    () => [botJid]
  );

  await service.postDailySummary();

  assert.equal(queue.enqueued.length, 1);
  const payload = queue.enqueued[0].payload as TextMessagePayload;
  assert.match(payload.text, /Vagas descobertas hoje: 3/);
  assert.match(payload.text, /Vagas enviadas hoje: 6/);
  assert.match(payload.text, /Mensagens com falha hoje: 2/);
  assert.match(payload.text, /Mensagens trocadas no grupo: 42/);
  assert.match(payload.text, /Pessoas que entraram: 2/);
  assert.match(payload.text, /Pessoas que saíram: 1/);
});
