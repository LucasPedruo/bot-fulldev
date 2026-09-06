CREATE TABLE "mention_reply_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_jid" text NOT NULL,
	"replied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_activity" ADD COLUMN "mention_mute_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "mention_reply_log_group_replied_idx" ON "mention_reply_log" USING btree ("group_jid","replied_at");