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
  WHATSAPP_FACULTY_JOBS_GROUP: z.string().optional().default(""),
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
  GREENHOUSE_JOBS_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  GREENHOUSE_JOBS_COUNT: z.coerce.number().int().min(1).max(100).default(20),
  GREENHOUSE_BOARD_SLUGS: z
    .string()
    .min(1)
    .default("nubank,stone,quintoandar,gympass,ebanx,wildlifestudios,vtex,rdstation,inter,c6bank"),
  JOBS_POLL_INTERVAL_MINUTES: z.coerce.number().int().positive().default(5),
  EVENTS_POLL_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
  EVENTS_POLL_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  EVENTS_MAX_PER_DAY: z.coerce.number().int().positive().default(10),
  EVENT_REMINDER_TIME: timeSchema.default("09:00"),
  EVENT_PROMO_TIME: timeSchema.default("10:00"),
  EVENT_CLEANUP_TIME: timeSchema.default("03:00"),
  AGENDA_TECH_BRASIL_EVENTS_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(true),
  LUMA_EVENTS_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  EVENTOSTI_DEV_EVENTS_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  CAFEBUGADO_EVENTS_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional().default(""),
  NETWORKING_MORNING_TIME: timeSchema.default("08:00"),
  NETWORKING_LUNCH_TIME: timeSchema.default("12:00"),
  NETWORKING_SUMMARY_TIME: timeSchema.default("18:00"),
  NETWORKING_NIGHT_TIME: timeSchema.default("20:00"),
  QUIET_HOURS_START: timeSchema.default("00:00"),
  QUIET_HOURS_END: timeSchema.default("07:00"),
  NETWORKING_MENTION_MAX_PER_HOUR: z.coerce.number().int().positive().default(5),
  NETWORKING_MENTION_COOLDOWN_HOURS: z.coerce.number().int().positive().default(2),
  MENTION_REPLY_AI_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
  NETWORKING_SCHEDULED_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  // Auto-approving pending join requests acts on the group without a human in the loop, and it
  // needs the bot to be a group admin, so it stays opt-in like every other side-effecting feature.
  NETWORKING_AUTO_APPROVE_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  // The member ceiling to stop approving at. 1024 is the classic WhatsApp limit and stays the
  // default, but it is NOT a universal cap - groups linked to a Community hold more (this bot is
  // already in groups of 1025 and 1114 members), so the value has to be configurable upwards.
  // Set it too low and the bot stops approving early and starts posting the "group is full"
  // notice while there is still room.
  NETWORKING_GROUP_CAPACITY: z.coerce.number().int().positive().max(10_000).default(1024),
  // Per-group ceilings, as "<jid>:<number>,<jid>:<number>". Real groups disagree with the
  // default: FullDev - Vagas 1 already holds 1025 members and a PUC group holds 1114, so a
  // single global number would make the bot refuse to approve into groups that still have room.
  GROUP_CAPACITY_OVERRIDES: z.string().optional().default(""),
  // Extends the join-request approval to the jobs groups, which fill up the same way.
  JOBS_AUTO_APPROVE_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  // The join-request event catches requests that arrive while the bot is online; this sweep is
  // what picks up the ones that piled up while it was down.
  NETWORKING_JOIN_REQUEST_POLL_MINUTES: z.coerce.number().int().positive().default(15),
  NETWORKING_WAITLIST_NOTICE_COOLDOWN_HOURS: z.coerce.number().int().positive().default(24),
  // Faculty relay: reads the course-representatives group and forwards a summary of what the
  // professors announce to the college community's events group.
  WHATSAPP_EIXO_REPRESENTATIVES_GROUP: z.string().optional().default(""),
  WHATSAPP_FACULTY_EVENTS_GROUP: z.string().optional().default(""),
  FACULTY_RELAY_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  // How long to wait after the last message before summarizing, so an announcement split across
  // several messages is relayed as one summary instead of being chopped up.
  FACULTY_RELAY_DEBOUNCE_MINUTES: z.coerce.number().int().positive().default(5),
  // Announces the current version plus its changelog entry once, the first time the bot boots on
  // a version it has not announced yet.
  RELEASE_ANNOUNCEMENTS_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  // Greets the group when the bot is added to it.
  GROUP_INTRODUCTION_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  // Accessibility: turns images and stickers into a text description so blind members using a
  // screen reader get the content instead of silence. Needs a multimodal model - the text-only
  // GROQ_MODEL rejects image content outright.
  IMAGE_DESCRIPTION_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  GROQ_VISION_MODEL: z.string().min(1).default("qwen/qwen3.8-27b"),
  // Groq rejects oversized payloads, and a base64 image is ~33% larger than the file.
  IMAGE_DESCRIPTION_MAX_BYTES: z.coerce.number().int().positive().default(3_000_000),
  // Networking moderation: keeps networking groups focused on technology, career, project work
  // and respectful technical debate. Admins are never touched.
  NETWORKING_MODERATION_ENABLED: z.union([z.boolean(), booleanStringSchema]).default(false),
  NETWORKING_MODERATION_STRIKE_LIMIT: z.coerce.number().int().min(1).default(3),
  NETWORKING_MODERATION_BLOCK_DAYS: z.coerce.number().int().positive().default(14)
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
