import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env.js";
import { jobService, type JobService } from "../jobs/job.service.js";
import { logger } from "../shared/logger.js";

export class JobsScheduler {
  private task?: ScheduledTask;

  constructor(private readonly service: JobService = jobService) {}

  start(): void {
    if (this.task) {
      return;
    }

    const expression = `*/${env.JOBS_POLL_INTERVAL_MINUTES} * * * *`;
    this.task = cron.schedule(
      expression,
      () => {
        void this.service.poll().catch((error: unknown) => {
          logger.error({ err: error }, "Jobs scheduler failed");
        });
      },
      {
        timezone: env.TZ
      }
    );

    logger.info({ expression, timezone: env.TZ }, "Jobs scheduler started");
  }

  stop(): void {
    void this.task?.stop();
    this.task = undefined;
    logger.info("Jobs scheduler stopped");
  }
}

export const jobsScheduler = new JobsScheduler();
