CREATE TABLE "ambient_reply_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_jid" text NOT NULL,
	"replied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_activity" ADD COLUMN "ambient_reply_mute_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group_activity" ADD COLUMN "last_ambient_reaction_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "ambient_reply_log_group_replied_idx" ON "ambient_reply_log" USING btree ("group_jid","replied_at");