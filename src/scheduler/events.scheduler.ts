import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env.js";
import { eventService, type EventService } from "../events/event.service.js";
import { logger } from "../shared/logger.js";

export class EventsScheduler {
  private task?: ScheduledTask;

  constructor(private readonly service: EventService = eventService) {}

  start(): void {
    if (this.task) {
      return;
    }

    const expression = `*/${env.EVENTS_POLL_INTERVAL_MINUTES} * * * *`;
    this.task = cron.schedule(
      expression,
      () => {
        void this.service.poll().catch((error: unknown) => {
          logger.error({ err: error }, "Events scheduler failed");
        });
      },
      {
        timezone: env.TZ
      }
    );

    logger.info({ expression, timezone: env.TZ }, "Events scheduler started");
  }

  stop(): void {
    void this.task?.stop();
    this.task = undefined;
    logger.info("Events scheduler stopped");
  }
}

export const eventsScheduler = new EventsScheduler();
