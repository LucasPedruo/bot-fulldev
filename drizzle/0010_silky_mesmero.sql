ALTER TABLE "event_notifications" DROP CONSTRAINT "event_notifications_event_id_events_id_fk";
--> statement-breakpoint
ALTER TABLE "event_notifications" ADD CONSTRAINT "event_notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;