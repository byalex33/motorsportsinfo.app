CREATE TABLE "fia_documents" (
	"url" text PRIMARY KEY NOT NULL,
	"series" text NOT NULL,
	"round_id" text NOT NULL,
	"event" text NOT NULL,
	"number" integer,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"file" text,
	"published_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "document_alerts" jsonb DEFAULT '{}'::jsonb NOT NULL;