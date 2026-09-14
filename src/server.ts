import type { BaileysEventMap, WAMessage } from "@whiskeysockets/baileys";
import { createImageDescriptionListener } from "./accessibility/image-description-listener.js";
import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { closeDatabase } from "./database/client.js";
import { runMigrations } from "./database/migrate.js";
import { createEventQnaListener } from "./events/event-qna-listener.js";
import { createFacultyRelayListener } from "./faculty/faculty-relay-listener.js";
import { createJobQnaListener } from "./jobs/job-qna-listener.js";
import {
  createNetworkingModerationListener,
  createWhatsAppModerationActions
} from "./moderation/moderation-listener.js";
import {
  buildNetworkingRemovalMessage,
  buildNetworkingWarningMessage,
  ModerationService
} from "./moderation/moderation.service.js";
import { createGroupIntroductionListener } from "./networking/group-introduction-listener.js";
import { introductionBackfillService } from "./networking/introduction-backfill.service.js";
import { createJoinRequestListener } from "./networking/join-request-listener.js";
import { createNetworkingMembershipListener } from "./networking/membership-listener.js";
import { createNetworkingMessageListener } from "./networking/message-listener.js";
import { queueWorker } from "./queue/queue.worker.js";
import { releaseAnnouncerService } from "./release/release-announcer.service.js";
import { eventCleanupScheduler } from "./scheduler/event-cleanup.scheduler.js";
import { eventPromoScheduler } from "./scheduler/event-promo.scheduler.js";
import { eventRemindersScheduler } from "./scheduler/event-reminders.scheduler.js";
import { eventsScheduler } from "./scheduler/events.scheduler.js";
import { jobsScheduler } from "./scheduler/jobs.scheduler.js";
import { joinRequestsScheduler } from "./scheduler/join-requests.scheduler.js";
import { networkingScheduledScheduler } from "./scheduler/networking-scheduled.scheduler.js";
import { logger } from "./shared/logger.js";
import { whatsapp } from "./whatsapp/client.js";

type GroupParticipantsUpdate = BaileysEventMap["group-participants.update"];

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
    // Same one-slot constraint as the message handler, so participant updates get composed too.
    const participantHandlers: Array<(update: GroupParticipantsUpdate) => void | Promise<void>> = [];
    const getBotJids = (): string[] => {
      const user = whatsapp.getSocket()?.user;
      return [user?.id, user?.lid].filter((jid): jid is string => Boolean(jid));
    };

    // Both listeners feed data the scheduled feature depends on (message counts, join/leave counts
    // for the daily summary, plus mention-reply/welcome-goodbye handling), so they run whenever the
    // networking feature is enabled.
    if (env.NETWORKING_SCHEDULED_ENABLED) {
      messageHandlers.push(createNetworkingMessageListener({ getBotJids }));
      participantHandlers.push(createNetworkingMembershipListener());
    }

    // Independent of NETWORKING_SCHEDULED_ENABLED on purpose: approving pending members is a
    // moderation duty, not part of the scheduled-content feature.
    if (env.NETWORKING_AUTO_APPROVE_ENABLED) {
      whatsapp.setGroupJoinRequestHandler(createJoinRequestListener());
    }

    // Not tied to any group list: the whole point is greeting groups the bot was just added to,
    // including ones nobody configured.
    if (env.GROUP_INTRODUCTION_ENABLED) {
      participantHandlers.push(createGroupIntroductionListener({ getBotJids }));
    }

    if (env.FACULTY_RELAY_ENABLED) {
      messageHandlers.push(createFacultyRelayListener());
    }

    // Registered BEFORE the moderation listener on purpose: handlers run in order, and an image
    // should be described (and so become classifiable) before anything decides whether to delete it.
    if (env.IMAGE_DESCRIPTION_ENABLED) {
      messageHandlers.push(createImageDescriptionListener());
    }

    if (env.NETWORKING_MODERATION_ENABLED) {
      const moderation = new ModerationService({
        actions: createWhatsAppModerationActions(),
        strikeLimit: env.NETWORKING_MODERATION_STRIKE_LIMIT,
        blockDays: env.NETWORKING_MODERATION_BLOCK_DAYS,
        warningMessage: buildNetworkingWarningMessage,
        removalMessage: buildNetworkingRemovalMessage
      });
      messageHandlers.push(createNetworkingModerationListener({ service: moderation }));
    }

    if (env.EVENTS_POLL_ENABLED) {
      messageHandlers.push(createEventQnaListener({ getBotJids }));
    }

    if (env.JOBS_POLL_ENABLED) {
      messageHandlers.push(createJobQnaListener({ getBotJids }));
    }

    if (participantHandlers.length > 0) {
      whatsapp.setGroupParticipantsHandler(async (update) => {
        for (const handler of participantHandlers) {
          await handler(update);
        }
      });
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

    if (env.NETWORKING_SCHEDULED_ENABLED) {
      networkingScheduledScheduler.start();
    } else {
      logger.info("Networking scheduled scheduler disabled");
    }

    if (env.NETWORKING_AUTO_APPROVE_ENABLED) {
      joinRequestsScheduler.start();
    } else {
      logger.info("Join requests scheduler disabled");
    }

    if (env.EVENTS_POLL_ENABLED) {
      eventsScheduler.start();
      eventRemindersScheduler.start();
      eventPromoScheduler.start();
      eventCleanupScheduler.start();
    } else {
      logger.info("Events scheduler disabled");
    }

    if (env.GROUP_INTRODUCTION_ENABLED) {
      // Covers the groups the bot was already in when the feature shipped - the join listener
      // above only ever fires for a group it is added to while online.
      await introductionBackfillService.run().catch((error: unknown) => {
        logger.error({ err: error }, "Group introduction backfill failed");
      });
    }

    if (env.RELEASE_ANNOUNCEMENTS_ENABLED) {
      // Queued, not sent: the worker delivers it once WhatsApp is connected, so this never
      // blocks or fails the boot.
      await releaseAnnouncerService.announceIfNeeded().catch((error: unknown) => {
        logger.error({ err: error }, "Release announcement failed");
      });
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
  networkingScheduledScheduler.stop();
  joinRequestsScheduler.stop();
  eventsScheduler.stop();
  eventRemindersScheduler.stop();
  eventPromoScheduler.stop();
  eventCleanupScheduler.stop();
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
