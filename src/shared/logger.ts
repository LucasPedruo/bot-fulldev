import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: "fulldev-bot"
  },
  redact: {
    paths: ["DATABASE_URL", "*.password", "*.token", "*.secret", "*.credential"],
    censor: "[redacted]"
  }
});
