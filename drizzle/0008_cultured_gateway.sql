CREATE TYPE "public"."event_modality" AS ENUM('in_person', 'online', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."event_notification_type" AS ENUM('new_event', 'registration_open', 'event_7_days', 'event_3_days', 'event_tomorrow', 'event_today');--> statement-breakpoint
CREATE TABLE "event_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"type" "event_notification_type" NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_notifications_event_type_unique" UNIQUE("event_id","type")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"modality" "event_modality" NOT NULL,
	"url" text NOT NULL,
	"fingerprint" text NOT NULL,
	"start_date" timestamp with time zone,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_fingerprint_unique" UNIQUE("fingerprint"),
	CONSTRAINT "events_source_external_id_unique" UNIQUE("source","external_id")
);
--> statement-breakpoint
ALTER TABLE "event_notifications" ADD CONSTRAINT "event_notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_source_idx" ON "events" USING btree ("source");--> statement-breakpoint
CREATE INDEX "events_discovered_at_idx" ON "events" USING btree ("discovered_at");--> statement-breakpoint
CREATE INDEX "events_start_date_idx" ON "events" USING btree ("start_date");