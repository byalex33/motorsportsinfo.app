CREATE TABLE "push_signup_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"client" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fia_documents" ADD COLUMN "pending_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fia_documents" ADD COLUMN "sent_through" uuid;--> statement-breakpoint
ALTER TABLE "reminders_sent" ADD COLUMN "pending_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schedule_changes" ADD COLUMN "pending_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schedule_changes" ADD COLUMN "sent_through" uuid;--> statement-breakpoint
CREATE INDEX "push_signup_attempts_client_idx" ON "push_signup_attempts" USING btree ("client","attempted_at");