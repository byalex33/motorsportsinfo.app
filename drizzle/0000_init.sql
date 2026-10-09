CREATE TABLE "pending_session_changes" (
	"session_id" text PRIMARY KEY NOT NULL,
	"observed_starts_at" timestamp with time zone NOT NULL,
	"observed_ends_at" timestamp with time zone NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"lead_minutes" integer DEFAULT 15 NOT NULL,
	"follows" jsonb NOT NULL,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "reminders_sent" (
	"subscription_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_sent_subscription_id_session_id_starts_at_pk" PRIMARY KEY("subscription_id","session_id","starts_at")
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"series" text NOT NULL,
	"season" smallint NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"circuit_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"session_times_confirmed" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"series" text NOT NULL,
	"kind" text NOT NULL,
	"previous_starts_at" timestamp with time zone NOT NULL,
	"new_starts_at" timestamp with time zone,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "schedule_flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"series" text NOT NULL,
	"session_id" text,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"round_id" text NOT NULL,
	"series" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"end_is_estimated" boolean NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_checks" (
	"series" text PRIMARY KEY NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_succeeded_at" timestamp with time zone,
	"last_source" text,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "reminders_sent" ADD CONSTRAINT "reminders_sent_subscription_id_push_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."push_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;