import dotenv from "dotenv";
import { z } from "zod";

if (process.env.NODE_ENV === "production") {
  dotenv.config();
} else {
  dotenv.config();
  dotenv.config({ path: ".env.local", override: true });
}

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");
const booleanStringSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value, context) => {
    if (["true", "1", "yes", "on"].includes(value)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(value)) {
      return false;
    }

    context.addIssue({
      code: "custom",
      message: "Expected boolean value"
    });
    return z.NEVER;
  });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TZ: z.string().default("America/Sao_Paulo"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  BAILEYS_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("warn"),
  DATABASE_URL: z.string().url().default("postgres://fulldev:fulldev@localhost:5432/fulldev_bot"),
  WHATSAPP_JOBS_GROUP_1: z.string().optional().default(""),
  WHATSAPP_JOBS_GROUP_2: z.string().optional().default(""),
  WHATSAPP_EVENTS_GROUP: z.string().optional().default(""),
  WHATSAPP_NETWORKING_GROUP: z.string().optional().default(""),
  WHATSAPP_NETWORKING_GROUP_1: z.string().optional().default(""),
  WHATSAPP_NETWORKING_GROUP_2: z.string().optional().default(""),
  WHATSAPP_AUTH_DIR: z.string().min(1).default("data/whatsapp"),
  WHATSAPP_AUTO_CONNECT: z.union([z.boolean(), booleanStringSchema]).default(true),
  WHATSAPP_PAIRING_PHONE_NUMBER: z
    .string()
    .regex(/^\d{10,15}$/, "Use country code and digits only")
    .optional()
    .or(z.literal(""))
    .default(""),
  MESSAGE_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
  MESSAGE_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  JOBS_POLL_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(true),
  JOBS_MAX_PER_DAY: z.coerce.number().int().positive().default(15),
  JOBICY_JOBS_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(true),
  JOBICY_JOBS_COUNT: z.coerce.number().int().min(1).max(200).default(50),
  REMOTIVE_JOBS_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  REMOTIVE_JOBS_COUNT: z.coerce.number().int().min(1).max(100).default(20),
  REMOTEOK_JOBS_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  REMOTEOK_JOBS_COUNT: z.coerce.number().int().min(1).max(100).default(20),
  ARBEITNOW_JOBS_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  ARBEITNOW_JOBS_COUNT: z.coerce.number().int().min(1).max(100).default(20),
  HIMALAYAS_JOBS_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  HIMALAYAS_JOBS_COUNT: z.coerce.number().int().min(1).max(100).default(20),
  JOBS_POLL_INTERVAL_MINUTES: z.coerce.number().int().positive().default(5),
  EVENTS_POLL_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
  NETWORKING_MORNING_TIME: timeSchema.default("08:00"),
  NETWORKING_LUNCH_TIME: timeSchema.default("12:00"),
  NETWORKING_SUMMARY_TIME: timeSchema.default("18:00"),
  NETWORKING_NIGHT_TIME: timeSchema.default("20:00")
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const productionEnvSchema = envSchema.superRefine((value, context) => {
    if (value.NODE_ENV === "production" && !source.DATABASE_URL) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "DATABASE_URL is required in production"
      });
    }
  });

  const parsed = productionEnvSchema.safeParse(source);

  if (!parsed.success) {
    const details = z.flattenError(parsed.error).fieldErrors;
    throw new Error(`Invalid environment configuration: ${JSON.stringify(details)}`);
  }

  process.env.TZ = parsed.data.TZ;
  return parsed.data;
}

export const env = loadEnv();
