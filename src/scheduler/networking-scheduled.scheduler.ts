import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env.js";
import { networkingScheduledService, type NetworkingScheduledService } from "../networking/networking-scheduled.service.js";
import { logger } from "../shared/logger.js";

export class NetworkingScheduledScheduler {
  private tasks: ScheduledTask[] = [];

  constructor(private readonly service: NetworkingScheduledService = networkingScheduledService) {}

  start(): void {
    if (this.tasks.length > 0) {
      return;
    }

    this.tasks = [
      this.schedule(env.NETWORKING_MORNING_TIME, () => this.service.postSpotlight("morning")),
      this.schedule(env.NETWORKING_LUNCH_TIME, () => this.service.postSpotlight("lunch")),
      this.schedule(env.NETWORKING_SUMMARY_TIME, () => this.service.postDailySummary()),
      this.schedule(env.NETWORKING_NIGHT_TIME, () => this.service.postSpotlight("night"))
    ];

    logger.info(
      {
        morning: env.NETWORKING_MORNING_TIME,
        lunch: env.NETWORKING_LUNCH_TIME,
        summary: env.NETWORKING_SUMMARY_TIME,
        night: env.NETWORKING_NIGHT_TIME,
        timezone: env.TZ
      },
      "Networking scheduled scheduler started"
    );
  }

  stop(): void {
    for (const task of this.tasks) {
      void task.stop();
    }

    this.tasks = [];
    logger.info("Networking scheduled scheduler stopped");
  }

  private schedule(time: string, run: () => Promise<void>): ScheduledTask {
    const [hours, minutes] = time.split(":");
    const expression = `${minutes} ${hours} * * *`;

    return cron.schedule(
      expression,
      () => {
        void run().catch((error: unknown) => {
          logger.error({ err: error, expression }, "Networking scheduled task failed");
        });
      },
      {
        timezone: env.TZ
      }
    );
  }
}

export const networkingScheduledScheduler = new NetworkingScheduledScheduler();
