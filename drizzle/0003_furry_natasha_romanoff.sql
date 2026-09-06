CREATE TYPE "public"."networking_topic_type" AS ENUM('joke', 'poll', 'critique', 'news');--> statement-breakpoint
CREATE TABLE "group_activity" (
	"group_jid" text PRIMARY KEY NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "networking_topic_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_jid" text NOT NULL,
	"type" "networking_topic_type" NOT NULL,
	"content" text NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "networking_topic_history_group_used_idx" ON "networking_topic_history" USING btree ("group_jid","used_at");