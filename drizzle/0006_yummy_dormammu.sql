CREATE TYPE "public"."group_membership_action" AS ENUM('add', 'remove');--> statement-breakpoint
CREATE TYPE "public"."networking_spotlight_slot" AS ENUM('morning', 'lunch', 'night');--> statement-breakpoint
CREATE TABLE "group_membership_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_jid" text NOT NULL,
	"participant_jid" text NOT NULL,
	"action" "group_membership_action" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "networking_spotlight_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_jid" text NOT NULL,
	"participant_jid" text NOT NULL,
	"slot" "networking_spotlight_slot" NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_activity" ADD COLUMN "messages_today" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "group_activity" ADD COLUMN "messages_today_date" date;--> statement-breakpoint
CREATE INDEX "group_membership_log_group_occurred_idx" ON "group_membership_log" USING btree ("group_jid","occurred_at");--> statement-breakpoint
CREATE INDEX "networking_spotlight_log_group_slot_used_idx" ON "networking_spotlight_log" USING btree ("group_jid","slot","used_at");