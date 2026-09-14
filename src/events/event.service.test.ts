import assert from "node:assert/strict";
import { test } from "node:test";
import { env } from "../config/env.js";
import type { EnqueueMessageInput, QueueMessage } from "../queue/queue.types.js";
import { EventService, type EventRepositoryLike, type QueueServiceLike } from "./event.service.js";
import type { EventNotificationType, NormalizedEvent, PersistedEvent } from "./event.types.js";
import type { EventProvider } from "./providers/provider.interface.js";

Object.assign(env, { WHATSAPP_EVENTS_GROUP: "120363429019612420@g.us" });

const event: NormalizedEvent = {
  externalId: "2026-09-02-gophercon-latam-2026",
  source: "AgendaTechBrasil",
  title: "Gophercon LATAM 2026",
  location: "Florianópolis/SC",
  modality: "in_person",
  url: "https://gopherconlatam.org/",
  fingerprint: "fingerprint",
  startDate: new Date(2026, 8, 2),
  discoveredAt: new Date("2026-09-01T00:00:00.000Z")
};

class FakeProvider implements EventProvider {
  public readonly name = "Fake";

  constructor(private readonly events: NormalizedEvent[]) {}

  async fetchEvents(): Promise<NormalizedEvent[]> {
    await Promise.resolve();
    return this.events;
  }
}

class FakeRepository implements EventRepositoryLike {
  public notifications: Array<{ eventId: string; type: EventNotificationType }> = [];
  public startingOnCalls: Date[] = [];
  public deleteExpiredCalls: Date[] = [];

  constructor(
    private readonly duplicate?: PersistedEvent,
    private readonly discoveredToday = 0,
    private readonly eventsStartingOn: PersistedEvent[] = [],
    private readonly notificationAlreadySent = false,
    private readonly expiredCount = 0
  ) {}

  async countDiscoveredSince(): Promise<number> {
    await Promise.resolve();
    return this.discoveredToday;
  }

  async findDuplicate(): Promise<PersistedEvent | undefined> {
    await Promise.resolve();
    return this.duplicate;
  }

  async insert(input: NormalizedEvent): Promise<PersistedEvent> {
    await Promise.resolve();
    return { ...input, id: "persisted-event-id" };
  }

  async recordNotification(eventId: string, type: EventNotificationType): Promise<boolean> {
    await Promise.resolve();
    this.notifications.push({ eventId, type });
    return !this.notificationAlreadySent;
  }

  async findEventsStartingOn(date: Date): Promise<PersistedEvent[]> {
    await Promise.resolve();
    this.startingOnCalls.push(date);
    return this.eventsStartingOn;
  }

  async deleteExpired(before: Date): Promise<number> {
    await Promise.resolve();
    this.deleteExpiredCalls.push(before);
    return this.expiredCount;
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

const withinEventMonth = () => new Date(2026, 8, 6);

void test("EventService queues a new event and records the new_event notification", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const service = new EventService([new FakeProvider([event])], repository, queue, withinEventMonth);

  const result = await service.poll();

  assert.equal(result.discovered, 1);
  assert.equal(result.queued, 1);
  assert.equal(queue.enqueued.length, 1);
  assert.equal(queue.enqueued[0].type, "event");
  assert.equal(queue.enqueued[0].destinationGroup, "120363429019612420@g.us");
  assert.deepEqual(repository.notifications, [{ eventId: "persisted-event-id", type: "new_event" }]);
});

void test("EventService skips duplicate events", async () => {
  const repository = new FakeRepository({ ...event, id: "existing-event-id" });
  const queue = new FakeQueue();
  const service = new EventService([new FakeProvider([event])], repository, queue);

  const result = await service.poll();

  assert.equal(result.discovered, 0);
  assert.equal(result.skippedDuplicates, 1);
  assert.equal(queue.enqueued.length, 0);
});

void test("EventService skips polling entirely once the daily limit is already reached", async () => {
  const repository = new FakeRepository(undefined, env.EVENTS_MAX_PER_DAY);
  const queue = new FakeQueue();
  const service = new EventService([new FakeProvider([event])], repository, queue);

  const result = await service.poll();

  assert.equal(result.fetched, 0);
  assert.equal(result.discovered, 0);
  assert.equal(queue.enqueued.length, 0);
});

void test("EventService stops enqueueing once the daily limit is reached mid-poll", async () => {
  const secondEvent: NormalizedEvent = { ...event, externalId: "event-2", fingerprint: "fingerprint-2" };
  const repository = new FakeRepository(undefined, env.EVENTS_MAX_PER_DAY - 1);
  const queue = new FakeQueue();
  const service = new EventService([new FakeProvider([event, secondEvent])], repository, queue, withinEventMonth);

  const result = await service.poll();

  assert.equal(result.fetched, 2);
  assert.equal(result.discovered, 1);
  assert.equal(queue.enqueued.length, 1);
});

void test("EventService inserts but does not announce an event happening in a future month", async () => {
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const service = new EventService([new FakeProvider([event])], repository, queue, () => new Date(2026, 5, 1)); // June

  const result = await service.poll();

  assert.equal(result.discovered, 1);
  assert.equal(result.queued, 0);
  assert.equal(queue.enqueued.length, 0);
  assert.deepEqual(repository.notifications, []);
});

void test("EventService always announces a TBA event regardless of month", async () => {
  const tbaEvent: NormalizedEvent = { ...event, startDate: undefined };
  const repository = new FakeRepository();
  const queue = new FakeQueue();
  const service = new EventService([new FakeProvider([tbaEvent])], repository, queue, () => new Date(2026, 5, 1));

  const result = await service.poll();

  assert.equal(result.queued, 1);
  assert.equal(queue.enqueued.length, 1);
});

void test("sendReminders enqueues one reminder per offset for events starting that day", async () => {
  const persisted: PersistedEvent = { ...event, id: "event-1" };
  const repository = new FakeRepository(undefined, 0, [persisted]);
  const queue = new FakeQueue();
  const service = new EventService([], repository, queue, () => new Date(2026, 8, 2));

  const result = await service.sendReminders();

  assert.equal(result.sent, 4);
  assert.equal(queue.enqueued.length, 4);
  assert.equal(repository.startingOnCalls.length, 4);
  assert.deepEqual(
    repository.notifications.map((n) => n.type),
    ["event_7_days", "event_3_days", "event_tomorrow", "event_today"]
  );
});

void test("sendReminders never resends a reminder type already recorded for an event", async () => {
  const persisted: PersistedEvent = { ...event, id: "event-1" };
  const repository = new FakeRepository(undefined, 0, [persisted], true);
  const queue = new FakeQueue();
  const service = new EventService([], repository, queue, () => new Date(2026, 8, 2));

  const result = await service.sendReminders();

  assert.equal(result.sent, 0);
  assert.equal(queue.enqueued.length, 0);
});

void test("sendPromotions creates only a native event for events 5 days out", async () => {
  const persisted: PersistedEvent = { ...event, id: "event-1" };
  const repository = new FakeRepository(undefined, 0, [persisted]);
  const queue = new FakeQueue();
  const service = new EventService([], repository, queue, () => new Date(2026, 8, 2));

  const result = await service.sendPromotions();

  assert.equal(result.sent, 1);
  assert.equal(queue.enqueued.length, 1);
  assert.deepEqual(repository.notifications, [{ eventId: "event-1", type: "event_promo" }]);

  const [eventMessage] = queue.enqueued;
  assert.equal(eventMessage.type, "event_promo");
  assert.ok("eventCreation" in eventMessage.payload && eventMessage.payload.eventCreation.name === event.title);
});

void test("sendPromotions never resends the promo for an event already promoted", async () => {
  const persisted: PersistedEvent = { ...event, id: "event-1" };
  const repository = new FakeRepository(undefined, 0, [persisted], true);
  const queue = new FakeQueue();
  const service = new EventService([], repository, queue, () => new Date(2026, 8, 2));

  const result = await service.sendPromotions();

  assert.equal(result.sent, 0);
  assert.equal(queue.enqueued.length, 0);
});

void test("cleanupExpiredEvents deletes events dated before today", async () => {
  const repository = new FakeRepository(undefined, 0, [], false, 3);
  const queue = new FakeQueue();
  const service = new EventService([], repository, queue, () => new Date(2026, 8, 6, 15, 30));

  const result = await service.cleanupExpiredEvents();

  assert.equal(result.deleted, 3);
  assert.equal(repository.deleteExpiredCalls.length, 1);
  assert.deepEqual(repository.deleteExpiredCalls[0], new Date(2026, 8, 6, 0, 0, 0, 0));
});
