import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env.js";
import { joinRequestService, type JoinRequestService } from "../networking/join-request.service.js";
import { logger } from "../shared/logger.js";

// The group.join-request event only fires while the bot is connected, so requests that arrive
// during a deploy, a reconnect or an outage would sit pending forever. This sweep is the safety
// net that eventually picks every one of them up.
export class JoinRequestsScheduler {
  private task?: ScheduledTask;

  constructor(private readonly service: Pick<JoinRequestService, "processAllGroups"> = joinRequestService) {}

  start(): void {
    if (this.task) {
      return;
    }

    const expression = `*/${env.NETWORKING_JOIN_REQUEST_POLL_MINUTES} * * * *`;
    this.task = cron.schedule(
      expression,
      () => {
        void this.service.processAllGroups().catch((error: unknown) => {
          logger.error({ err: error }, "Join requests scheduler failed");
        });
      },
      {
        timezone: env.TZ
      }
    );

    logger.info({ expression, timezone: env.TZ }, "Join requests scheduler started");
  }

  stop(): void {
    void this.task?.stop();
    this.task = undefined;
    logger.info("Join requests scheduler stopped");
  }
}

export const joinRequestsScheduler = new JoinRequestsScheduler();
