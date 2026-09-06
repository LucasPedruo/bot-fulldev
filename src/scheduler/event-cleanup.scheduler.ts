import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env.js";
import { eventService, type EventService } from "../events/event.service.js";
import { logger } from "../shared/logger.js";

export class EventCleanupScheduler {
  private task?: ScheduledTask;

  constructor(private readonly service: EventService = eventService) {}

  start(): void {
    if (this.task) {
      return;
    }

    const [hours, minutes] = env.EVENT_CLEANUP_TIME.split(":");
    const expression = `${minutes} ${hours} * * *`;

    this.task = cron.schedule(
      expression,
      () => {
        void this.service.cleanupExpiredEvents().catch((error: unknown) => {
          logger.error({ err: error }, "Event cleanup scheduler failed");
        });
      },
      {
        timezone: env.TZ
      }
    );

    logger.info({ expression, timezone: env.TZ }, "Event cleanup scheduler started");
  }

  stop(): void {
    void this.task?.stop();
    this.task = undefined;
    logger.info("Event cleanup scheduler stopped");
  }
}

export const eventCleanupScheduler = new EventCleanupScheduler();
