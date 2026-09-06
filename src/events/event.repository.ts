import { and, asc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import { db } from "../database/client.js";
import { eventNotifications, events } from "../database/schema.js";
import type { EventNotificationType, NormalizedEvent, PersistedEvent } from "./event.types.js";

type EventRow = typeof events.$inferSelect;

export type EventQueryFilter = {
  month?: number;
  year?: number;
  locationContains?: string;
  limit?: number;
};

export class EventRepository {
  async findDuplicate(event: NormalizedEvent): Promise<PersistedEvent | undefined> {
    const [row] = await db
      .select()
      .from(events)
      .where(or(and(eq(events.source, event.source), eq(events.externalId, event.externalId)), eq(events.fingerprint, event.fingerprint)))
      .limit(1);

    return row ? toPersistedEvent(row) : undefined;
  }

  async insert(event: NormalizedEvent): Promise<PersistedEvent> {
    const [row] = await db
      .insert(events)
      .values({
        externalId: event.externalId,
        source: event.source,
        title: event.title,
        location: event.location,
        modality: event.modality,
        url: event.url,
        fingerprint: event.fingerprint,
        startDate: event.startDate,
        discoveredAt: event.discoveredAt
      })
      .returning();

    return toPersistedEvent(row);
  }

  async countDiscoveredSince(since: Date): Promise<number> {
    const [row] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(events)
      .where(gte(events.discoveredAt, since));

    return row?.value ?? 0;
  }

  // Compares against the process-local calendar day (TZ is set to America/Sao_Paulo for the
  // whole app), not the raw UTC date, so a reminder scheduled for "today" matches what a human
  // in that timezone would call today, even though start_date is stored in UTC.
  async findEventsStartingOn(date: Date): Promise<PersistedEvent[]> {
    const { start, end } = localDayRange(date);
    const rows = await db
      .select()
      .from(events)
      .where(and(gte(events.startDate, start), lt(events.startDate, end)));

    return rows.map(toPersistedEvent);
  }

  async recordNotification(eventId: string, type: EventNotificationType): Promise<boolean> {
    const [row] = await db
      .insert(eventNotifications)
      .values({ eventId, type })
      .onConflictDoNothing()
      .returning({ id: eventNotifications.id });

    return Boolean(row);
  }

  // Backs the events Q&A feature: answers "tem evento em <mes/local>?" against what's actually
  // stored. With no month/location given, falls back to the next upcoming events overall.
  async query(filter: EventQueryFilter): Promise<PersistedEvent[]> {
    const conditions = [];

    if (filter.month !== undefined && filter.year !== undefined) {
      const { start, end } = localMonthRange(filter.year, filter.month);
      conditions.push(and(gte(events.startDate, start), lt(events.startDate, end)));
    }

    if (filter.locationContains) {
      conditions.push(ilike(events.location, `%${filter.locationContains}%`));
    }

    const rows = await db
      .select()
      .from(events)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(events.startDate))
      .limit(filter.limit ?? 5);

    return rows.map(toPersistedEvent);
  }
}

export const eventRepository = new EventRepository();

function toPersistedEvent(row: EventRow): PersistedEvent {
  return {
    id: row.id,
    externalId: row.externalId,
    source: row.source,
    title: row.title,
    location: row.location ?? undefined,
    modality: row.modality,
    url: row.url,
    fingerprint: row.fingerprint,
    startDate: row.startDate ?? undefined,
    discoveredAt: row.discoveredAt
  };
}

function localDayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
  return { start, end };
}

function localMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 1, 0, 0, 0, 0);
  return { start, end };
}
