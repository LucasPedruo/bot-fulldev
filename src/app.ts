import helmet from "@fastify/helmet";
import Fastify, { type FastifyInstance } from "fastify";
import { env } from "./config/env.js";
import { checkDatabase } from "./database/client.js";

export type ReadinessState = {
  worker: "ready" | "not_started" | "stopped" | "not_configured";
  whatsapp: "not_configured" | "connecting" | "qr_pending" | "connected" | "disconnected" | "logged_out";
};

export type AppOptions = {
  getWhatsAppStatus?: () => ReadinessState["whatsapp"];
  getWorkerStatus?: () => ReadinessState["worker"];
};

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      base: {
        service: "fulldev-bot"
      },
      redact: {
        paths: ["DATABASE_URL", "*.password", "*.token", "*.secret", "*.credential"],
        censor: "[redacted]"
      }
    }
  });

  void app.register(helmet);

  app.get("/health", () => ({
    status: "ok",
    service: "fulldev-bot",
    time: new Date().toISOString()
  }));

  app.get("/ready", async (_request, reply) => {
    const checks: {
      postgres: "ok" | "error";
      worker: ReadinessState["worker"];
      whatsapp: ReadinessState["whatsapp"];
    } = {
      postgres: "ok",
      worker: options.getWorkerStatus?.() ?? "not_configured",
      whatsapp: options.getWhatsAppStatus?.() ?? "not_configured"
    };

    try {
      await checkDatabase();
    } catch (error) {
      checks.postgres = "error";
      app.log.error({ err: error }, "PostgreSQL readiness check failed");
    }

    const ready =
      checks.postgres === "ok" &&
      (checks.worker === "not_configured" || checks.worker === "ready") &&
      (checks.whatsapp === "not_configured" || checks.whatsapp === "connected");

    if (!ready) {
      return reply.code(503).send({
        status: "not_ready",
        checks
      });
    }

    return {
      status: "ready",
      checks,
      timezone: env.TZ
    };
  });

  return app;
}
