CREATE TABLE "group_blocklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_jid" text NOT NULL,
	"participant_jid" text NOT NULL,
	"blocked_until" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_blocklist_group_participant_unique" UNIQUE("group_jid","participant_jid")
);
--> statement-breakpoint
CREATE TABLE "moderation_strikes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_jid" text NOT NULL,
	"participant_jid" text NOT NULL,
	"strikes" integer DEFAULT 0 NOT NULL,
	"last_strike_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_strikes_group_participant_unique" UNIQUE("group_jid","participant_jid")
);
--> statement-breakpoint
CREATE INDEX "group_blocklist_until_idx" ON "group_blocklist" USING btree ("blocked_until");