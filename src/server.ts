import type { WAMessage } from "@whiskeysockets/baileys";
import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { closeDatabase } from "./database/client.js";
import { runMigrations } from "./database/migrate.js";
import { createEventQnaListener } from "./events/event-qna-listener.js";
import { createJobQnaListener } from "./jobs/job-qna-listener.js";
import { createNetworkingMembershipListener } from "./networking/membership-listener.js";
import { createNetworkingMessageListener } from "./networking/message-listener.js";
import { queueWorker } from "./queue/queue.worker.js";
import { eventPromoScheduler } from "./scheduler/event-promo.scheduler.js";
import { eventRemindersScheduler } from "./scheduler/event-reminders.scheduler.js";
import { eventsScheduler } from "./scheduler/events.scheduler.js";
import { jobsScheduler } from "./scheduler/jobs.scheduler.js";
import { networkingIdleScheduler } from "./scheduler/networking-idle.scheduler.js";
import { networkingScheduledScheduler } from "./scheduler/networking-scheduled.scheduler.js";
import { logger } from "./shared/logger.js";
import { whatsapp } from "./whatsapp/client.js";

const app = buildApp({
  getWhatsAppStatus: () => whatsapp.getStatus(),
  getWorkerStatus: () => queueWorker.getStatus()
});

async function start(): Promise<void> {
  try {
    await runMigrations();
    logger.info("Database migrations applied");

    // The connection only holds one message handler slot, so every enabled feature that listens to
    // incoming messages gets composed into a single dispatcher here - each one already filters by
    // its own configured group(s), so calling all of them per message is safe.
    const messageHandlers: Array<(message: WAMessage) => void | Promise<void>> = [];
    const getBotJids = (): string[] => {
      const user = whatsapp.getSocket()?.user;
      return [user?.id, user?.lid].filter((jid): jid is string => Boolean(jid));
    };

    // Both listeners feed data the scheduled feature also depends on (message counts, join/leave
    // counts for the daily summary), so they run whenever either networking feature is enabled.
    if (env.NETWORKING_IDLE_ENABLED || env.NETWORKING_SCHEDULED_ENABLED) {
      messageHandlers.push(createNetworkingMessageListener({ getBotJids }));
      whatsapp.setGroupParticipantsHandler(createNetworkingMembershipListener());
    }

    if (env.EVENTS_POLL_ENABLED) {
      messageHandlers.push(createEventQnaListener({ getBotJids }));
    }

    if (env.JOBS_POLL_ENABLED) {
      messageHandlers.push(createJobQnaListener({ getBotJids }));
    }

    if (messageHandlers.length > 0) {
      whatsapp.setMessageHandler(async (message) => {
        for (const handler of messageHandlers) {
          await handler(message);
        }
      });
    }

    if (env.WHATSAPP_AUTO_CONNECT) {
      void whatsapp.start().catch((error: unknown) => {
        logger.error({ err: error }, "Failed to start WhatsApp connection");
      });
    }

    await queueWorker.start();
    if (env.JOBS_POLL_ENABLED) {
      jobsScheduler.start();
    } else {
      logger.info("Jobs scheduler disabled");
    }

    if (env.NETWORKING_IDLE_ENABLED) {
      networkingIdleScheduler.start();
    } else {
      logger.info("Networking idle scheduler disabled");
    }

    if (env.NETWORKING_SCHEDULED_ENABLED) {
      networkingScheduledScheduler.start();
    } else {
      logger.info("Networking scheduled scheduler disabled");
    }

    if (env.EVENTS_POLL_ENABLED) {
      eventsScheduler.start();
      eventRemindersScheduler.start();
      eventPromoScheduler.start();
    } else {
      logger.info("Events scheduler disabled");
    }

    await app.listen({ host: env.HOST, port: env.PORT });
    logger.info({ host: env.HOST, port: env.PORT, timezone: env.TZ }, "Server started");
  } catch (error) {
    logger.fatal({ err: error }, "Failed to start server");
    process.exit(1);
  }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, "Shutting down");
  jobsScheduler.stop();
  networkingIdleScheduler.stop();
  networkingScheduledScheduler.stop();
  eventsScheduler.stop();
  eventRemindersScheduler.stop();
  eventPromoScheduler.stop();
  queueWorker.stop();
  whatsapp.stop();
  await app.close();
  await closeDatabase();
}

process.once("SIGINT", (signal) => {
  void shutdown(signal).finally(() => process.exit(0));
});

process.once("SIGTERM", (signal) => {
  void shutdown(signal).finally(() => process.exit(0));
});

void start();
