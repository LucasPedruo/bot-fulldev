import { env } from "../config/env.js";
import { queueService } from "../queue/queue.service.js";
import type { QueueMessage } from "../queue/queue.types.js";
import { logger } from "../shared/logger.js";
import { getConfiguredWhatsAppGroups } from "../whatsapp/groups.js";
import { formatEventReminderMessage, formatNewEventMessage } from "./event.formatter.js";
import { EventRepository } from "./event.repository.js";
import type { EventNotificationType, NormalizedEvent, PersistedEvent } from "./event.types.js";
import { AgendaTechBrasilProvider } from "./providers/agenda-tech-brasil.provider.js";
import type { EventProvider } from "./providers/provider.interface.js";

export type EventsPollResult = {
  fetched: number;
  discovered: number;
  queued: number;
  skippedDuplicates: number;
  providerFailures: number;
};

export type EventRepositoryLike = Pick<
  EventRepository,
  "countDiscoveredSince" | "findDuplicate" | "insert" | "recordNotification" | "findEventsStartingOn"
>;
export type QueueServiceLike = {
  enqueue(input: Parameters<typeof queueService.enqueue>[0]): Promise<QueueMessage>;
};

const reminderOffsets: Array<{ type: EventNotificationType; days: number }> = [
  { type: "event_7_days", days: 7 },
  { type: "event_3_days", days: 3 },
  { type: "event_tomorrow", days: 1 },
  { type: "event_today", days: 0 }
];

export class EventService {
  constructor(
    private readonly providers: EventProvider[] = createDefaultProviders(),
    private readonly repository: EventRepositoryLike = new EventRepository(),
    private readonly queue: QueueServiceLike = queueService,
    private readonly now: () => Date = () => new Date()
  ) {}

  async poll(): Promise<EventsPollResult> {
    const discoveredToday = await this.repository.countDiscoveredSince(startOfDay(this.now()));
    const dailyRemaining = env.EVENTS_MAX_PER_DAY - discoveredToday;

    if (dailyRemaining <= 0) {
      logger.info({ maxPerDay: env.EVENTS_MAX_PER_DAY, discoveredToday }, "Daily event limit reached, skipping poll");
      return { fetched: 0, discovered: 0, queued: 0, skippedDuplicates: 0, providerFailures: 0 };
    }

    const results = await Promise.allSettled(this.providers.map((provider) => provider.fetchEvents()));
    const fetchedEvents: NormalizedEvent[] = [];
    let providerFailures = 0;

    for (const result of results) {
      if (result.status === "fulfilled") {
        fetchedEvents.push(...result.value);
      } else {
        providerFailures += 1;
        logger.error({ err: result.reason }, "Event provider failed");
      }
    }

    let discovered = 0;
    let queued = 0;
    let skippedDuplicates = 0;

    for (const event of fetchedEvents) {
      if (discovered >= dailyRemaining) {
        break;
      }

      const existing = await this.repository.findDuplicate(event);
      if (existing) {
        skippedDuplicates += 1;
        continue;
      }

      const persisted = await this.repository.insert(event);
      discovered += 1;
      queued += await this.notifyNewEvent(persisted);
    }

    logger.info({ fetched: fetchedEvents.length, discovered, queued, skippedDuplicates, providerFailures }, "New events discovered");

    return { fetched: fetchedEvents.length, discovered, queued, skippedDuplicates, providerFailures };
  }

  async sendReminders(): Promise<{ sent: number }> {
    let sent = 0;

    for (const offset of reminderOffsets) {
      const targetDate = new Date(this.now());
      targetDate.setDate(targetDate.getDate() + offset.days);

      const events = await this.repository.findEventsStartingOn(targetDate);

      for (const event of events) {
        const created = await this.repository.recordNotification(event.id, offset.type);
        if (!created) {
          // Already sent this reminder type for this event - never resend.
          continue;
        }

        const destinationGroup = getConfiguredWhatsAppGroups().eventsGroup;
        if (!destinationGroup) {
          continue;
        }

        await this.queue.enqueue({
          type: "event_reminder",
          destinationGroup,
          payload: { text: formatEventReminderMessage(event, offset.type) }
        });
        sent += 1;
      }
    }

    logger.info({ sent }, "Event reminders sent");
    return { sent };
  }

  private async notifyNewEvent(event: PersistedEvent): Promise<number> {
    const destinationGroup = getConfiguredWhatsAppGroups().eventsGroup;
    if (!destinationGroup) {
      return 0;
    }

    await this.queue.enqueue({
      type: "event",
      destinationGroup,
      payload: { text: formatNewEventMessage(event) }
    });
    await this.repository.recordNotification(event.id, "new_event");
    return 1;
  }
}

export const eventService = new EventService();

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function createDefaultProviders(): EventProvider[] {
  return [new AgendaTechBrasilProvider()];
}
