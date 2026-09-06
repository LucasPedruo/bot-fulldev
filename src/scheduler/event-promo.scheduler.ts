import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env.js";
import { eventService, type EventService } from "../events/event.service.js";
import { logger } from "../shared/logger.js";

export class EventPromoScheduler {
  private task?: ScheduledTask;

  constructor(private readonly service: EventService = eventService) {}

  start(): void {
    if (this.task) {
      return;
    }

    const [hours, minutes] = env.EVENT_PROMO_TIME.split(":");
    const expression = `${minutes} ${hours} * * *`;

    this.task = cron.schedule(
      expression,
      () => {
        void this.service.sendPromotions().catch((error: unknown) => {
          logger.error({ err: error }, "Event promo scheduler failed");
        });
      },
      {
        timezone: env.TZ
      }
    );

    logger.info({ expression, timezone: env.TZ }, "Event promo scheduler started");
  }

  stop(): void {
    void this.task?.stop();
    this.task = undefined;
    logger.info("Event promo scheduler stopped");
  }
}

export const eventPromoScheduler = new EventPromoScheduler();
