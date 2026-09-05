CREATE TYPE "public"."job_category" AS ENUM('frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data', 'qa', 'design', 'other');--> statement-breakpoint
CREATE TYPE "public"."job_level" AS ENUM('intern', 'junior', 'mid', 'senior');--> statement-breakpoint
CREATE TABLE "job_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"destination_group" text NOT NULL,
	"queue_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_deliveries_job_destination_unique" UNIQUE("job_id","destination_group")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"location" text,
	"remote" boolean NOT NULL,
	"level" "job_level",
	"category" "job_category" NOT NULL,
	"technologies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"url" text NOT NULL,
	"fingerprint" text NOT NULL,
	"published_at" timestamp with time zone,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_fingerprint_unique" UNIQUE("fingerprint"),
	CONSTRAINT "jobs_source_external_id_unique" UNIQUE("source","external_id")
);
--> statement-breakpoint
ALTER TABLE "job_deliveries" ADD CONSTRAINT "job_deliveries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_deliveries" ADD CONSTRAINT "job_deliveries_queue_message_id_message_queue_id_fk" FOREIGN KEY ("queue_message_id") REFERENCES "public"."message_queue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_deliveries_destination_idx" ON "job_deliveries" USING btree ("destination_group");--> statement-breakpoint
CREATE INDEX "jobs_source_idx" ON "jobs" USING btree ("source");--> statement-breakpoint
CREATE INDEX "jobs_discovered_at_idx" ON "jobs" USING btree ("discovered_at");