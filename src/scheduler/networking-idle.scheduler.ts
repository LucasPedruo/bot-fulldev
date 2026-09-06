import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env.js";
import { networkingIdleService, type NetworkingIdleService } from "../networking/networking-idle.service.js";
import { logger } from "../shared/logger.js";

export class NetworkingIdleScheduler {
  private task?: ScheduledTask;

  constructor(private readonly service: NetworkingIdleService = networkingIdleService) {}

  start(): void {
    if (this.task) {
      return;
    }

    const expression = `*/${env.NETWORKING_IDLE_CHECK_INTERVAL_MINUTES} * * * *`;
    this.task = cron.schedule(
      expression,
      () => {
        void this.service.checkAndPost().catch((error: unknown) => {
          logger.error({ err: error }, "Networking idle scheduler failed");
        });
      },
      {
        timezone: env.TZ
      }
    );

    logger.info({ expression, timezone: env.TZ }, "Networking idle scheduler started");
  }

  stop(): void {
    void this.task?.stop();
    this.task = undefined;
    logger.info("Networking idle scheduler stopped");
  }
}

export const networkingIdleScheduler = new NetworkingIdleScheduler();
