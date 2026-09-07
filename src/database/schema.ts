import { boolean, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const appMetadata = pgTable("app_metadata", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const messageQueueStatus = pgEnum("message_queue_status", ["pending", "processing", "sent", "failed", "cancelled"]);

export const messageQueueType = pgEnum("message_queue_type", ["manual", "job", "event", "event_reminder", "event_promo", "networking"]);

export const messageQueue = pgTable(
  "message_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: messageQueueType("type").notNull(),
    destinationGroup: text("destination_group").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: messageQueueStatus("status").notNull().default("pending"),
    priority: integer("priority").notNull().default(0),
    bypassQuietHours: boolean("bypass_quiet_hours").notNull().default(false),
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
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  mentionMuteUntil: timestamp("mention_mute_until", { withTimezone: true }),
  messagesToday: integer("messages_today").notNull().default(0),
  messagesTodayDate: date("messages_today_date")
});

export const groupMembershipAction = pgEnum("group_membership_action", ["add", "remove"]);

export const groupMembershipLog = pgTable(
  "group_membership_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupJid: text("group_jid").notNull(),
    participantJid: text("participant_jid").notNull(),
    action: groupMembershipAction("action").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("group_membership_log_group_occurred_idx").on(table.groupJid, table.occurredAt)]
);

export const networkingSpotlightSlot = pgEnum("networking_spotlight_slot", ["morning", "lunch", "night"]);

export const networkingSpotlightLog = pgTable(
  "networking_spotlight_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupJid: text("group_jid").notNull(),
    participantJid: text("participant_jid").notNull(),
    slot: networkingSpotlightSlot("slot").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("networking_spotlight_log_group_slot_used_idx").on(table.groupJid, table.slot, table.usedAt)]
);

export const mentionReplyLog = pgTable(
  "mention_reply_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupJid: text("group_jid").notNull(),
    repliedAt: timestamp("replied_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("mention_reply_log_group_replied_idx").on(table.groupJid, table.repliedAt)]
);

export const eventModality = pgEnum("event_modality", ["in_person", "online", "hybrid"]);

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalId: text("external_id").notNull(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    location: text("location"),
    modality: eventModality("modality").notNull(),
    url: text("url").notNull(),
    fingerprint: text("fingerprint").notNull().unique(),
    // Null for "to be announced" events with no confirmed date.
    startDate: timestamp("start_date", { withTimezone: true }),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("events_source_external_id_unique").on(table.source, table.externalId),
    index("events_source_idx").on(table.source),
    index("events_discovered_at_idx").on(table.discoveredAt),
    index("events_start_date_idx").on(table.startDate)
  ]
);

export const eventNotificationType = pgEnum("event_notification_type", [
  "new_event",
  "registration_open",
  "event_7_days",
  "event_3_days",
  "event_tomorrow",
  "event_today",
  "event_promo"
]);

export const eventNotifications = pgTable(
  "event_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    type: eventNotificationType("type").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("event_notifications_event_type_unique").on(table.eventId, table.type)]
);

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
