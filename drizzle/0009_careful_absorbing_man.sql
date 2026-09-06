ALTER TYPE "public"."event_notification_type" ADD VALUE 'event_promo';--> statement-breakpoint
ALTER TYPE "public"."message_queue_type" ADD VALUE 'event_promo' BEFORE 'networking';