import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env.js";
import { eventService, type EventService } from "../events/event.service.js";
import { logger } from "../shared/logger.js";

export class EventRemindersScheduler {
  private task?: ScheduledTask;

  constructor(private readonly service: EventService = eventService) {}

  start(): void {
    if (this.task) {
      return;
    }

    const [hours, minutes] = env.EVENT_REMINDER_TIME.split(":");
    const expression = `${minutes} ${hours} * * *`;

    this.task = cron.schedule(
      expression,
      () => {
        void this.service.sendReminders().catch((error: unknown) => {
          logger.error({ err: error }, "Event reminders scheduler failed");
        });
      },
      {
        timezone: env.TZ
      }
    );

    logger.info({ expression, timezone: env.TZ }, "Event reminders scheduler started");
  }

  stop(): void {
    void this.task?.stop();
    this.task = undefined;
    logger.info("Event reminders scheduler stopped");
  }
}

export const eventRemindersScheduler = new EventRemindersScheduler();
