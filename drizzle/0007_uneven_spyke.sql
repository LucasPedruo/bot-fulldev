CREATE TABLE "memes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"filename" text NOT NULL,
	"caption" text,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "memes_filename_unique" UNIQUE("filename")
);
