import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { closeDatabase } from "./database/client.js";
import { runMigrations } from "./database/migrate.js";
import { queueWorker } from "./queue/queue.worker.js";
import { jobsScheduler } from "./scheduler/jobs.scheduler.js";
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
