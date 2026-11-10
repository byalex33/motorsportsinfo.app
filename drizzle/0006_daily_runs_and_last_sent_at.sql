CREATE TABLE "daily_runs" (
	"day" date PRIMARY KEY NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "last_sent_at" timestamp with time zone;