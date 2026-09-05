CREATE TYPE "public"."message_queue_status" AS ENUM('pending', 'processing', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."message_queue_type" AS ENUM('manual', 'job', 'event', 'event_reminder', 'networking');--> statement-breakpoint
CREATE TABLE "message_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "message_queue_type" NOT NULL,
	"destination_group" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "message_queue_status" DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"processing_started_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "message_queue_pending_idx" ON "message_queue" USING btree ("status","scheduled_for","priority");--> statement-breakpoint
CREATE INDEX "message_queue_destination_idx" ON "message_queue" USING btree ("destination_group");