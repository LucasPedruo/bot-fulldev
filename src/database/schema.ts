import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const appMetadata = pgTable("app_metadata", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const messageQueueStatus = pgEnum("message_queue_status", ["pending", "processing", "sent", "failed", "cancelled"]);

export const messageQueueType = pgEnum("message_queue_type", ["manual", "job", "event", "event_reminder", "networking"]);

export const messageQueue = pgTable(
  "message_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: messageQueueType("type").notNull(),
    destinationGroup: text("destination_group").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: messageQueueStatus("status").notNull().default("pending"),
    priority: integer("priority").notNull().default(0),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true })
  },
  (table) => [
    index("message_queue_pending_idx").on(table.status, table.scheduledFor, table.priority),
    index("message_queue_destination_idx").on(table.destinationGroup)
  ]
);

export const jobLevel = pgEnum("job_level", ["intern", "junior", "mid", "senior"]);

export const jobCategory = pgEnum("job_category", [
  "frontend",
  "backend",
  "fullstack",
  "mobile",
  "devops",
  "data",
  "qa",
  "design",
  "other"
]);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalId: text("external_id").notNull(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    company: text("company").notNull(),
    location: text("location"),
    remote: boolean("remote").notNull(),
    level: jobLevel("level"),
    category: jobCategory("category").notNull(),
    technologies: jsonb("technologies").$type<string[]>().notNull().default([]),
    url: text("url").notNull(),
    fingerprint: text("fingerprint").notNull().unique(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("jobs_source_external_id_unique").on(table.source, table.externalId),
    index("jobs_source_idx").on(table.source),
    index("jobs_discovered_at_idx").on(table.discoveredAt)
  ]
);

export const jobDeliveries = pgTable(
  "job_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    destinationGroup: text("destination_group").notNull(),
    queueMessageId: uuid("queue_message_id").references(() => messageQueue.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("job_deliveries_job_destination_unique").on(table.jobId, table.destinationGroup),
    index("job_deliveries_destination_idx").on(table.destinationGroup)
  ]
);

export const groupActivity = pgTable("group_activity", {
  groupJid: text("group_jid").primaryKey(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow()
});

export const networkingTopicType = pgEnum("networking_topic_type", ["joke", "poll", "critique", "news"]);

export const networkingTopicHistory = pgTable(
  "networking_topic_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupJid: text("group_jid").notNull(),
    type: networkingTopicType("type").notNull(),
    content: text("content").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("networking_topic_history_group_used_idx").on(table.groupJid, table.usedAt)]
);
