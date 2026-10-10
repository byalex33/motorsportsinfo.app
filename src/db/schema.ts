import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { DocumentAlertLevel, FiaDocumentKind, FiaDocumentSeries, SeriesId, SessionStatus, SessionType } from "@/domain/types";

// ── Schedule (owned by the schedule sync) ──────────────────────────────────

export const rounds = pgTable("rounds", {
  id: text("id").primaryKey(),
  series: text("series").$type<SeriesId>().notNull(),
  season: smallint("season").notNull(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  circuitId: text("circuit_id").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  sessionTimesConfirmed: boolean("session_times_confirmed").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The published state of each Session, after Schedule Overrides. */
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  roundId: text("round_id")
    .notNull()
    .references(() => rounds.id, { onDelete: "cascade" }),
  series: text("series").$type<SeriesId>().notNull(),
  type: text("type").$type<SessionType>().notNull(),
  name: text("name").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  endIsEstimated: boolean("end_is_estimated").notNull(),
  status: text("status").$type<SessionStatus>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A change seen in a source but not yet published. A time change is published
 * once two checks in a row agree (seenCount >= 2).
 */
export const pendingSessionChanges = pgTable("pending_session_changes", {
  sessionId: text("session_id").primaryKey(),
  observedStartsAt: timestamp("observed_starts_at", { withTimezone: true }).notNull(),
  observedEndsAt: timestamp("observed_ends_at", { withTimezone: true }).notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  seenCount: integer("seen_count").notNull().default(1),
});

/** A published Schedule Change. Alerts push each one once, then set notifiedAt. */
export const scheduleChanges = pgTable("schedule_changes", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  series: text("series").$type<SeriesId>().notNull(),
  kind: text("kind").$type<"time" | "cancelled">().notNull(),
  previousStartsAt: timestamp("previous_starts_at", { withTimezone: true }).notNull(),
  newStartsAt: timestamp("new_starts_at", { withTimezone: true }),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
});

/** Something a human should look at: a Session vanished, an unknown Circuit, a source failing. Never pushed. */
export const scheduleFlags = pgTable("schedule_flags", {
  id: serial("id").primaryKey(),
  series: text("series").$type<SeriesId>().notNull(),
  sessionId: text("session_id"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const sourceChecks = pgTable("source_checks", {
  series: text("series").$type<SeriesId>().primaryKey(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastSucceededAt: timestamp("last_succeeded_at", { withTimezone: true }),
  lastSource: text("last_source"),
  lastError: text("last_error"),
});

// ── Alerts (owned by push + reminders) ─────────────────────────────────────

/** Which Session Types a device follows, per Series. */
export type Follows = Partial<Record<SeriesId, SessionType[]>>;

/** Which FIA Documents a device gets Document Alerts for, per Series. A Series left out gets none. */
export type DocumentAlerts = Partial<Record<FiaDocumentSeries, DocumentAlertLevel>>;

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  leadMinutes: integer("lead_minutes").notNull().default(15),
  follows: jsonb("follows").$type<Follows>().notNull(),
  /** The device's IANA time zone, used to format times in push text. */
  timeZone: text("time_zone").notNull().default("UTC"),
  documentAlerts: jsonb("document_alerts").$type<DocumentAlerts>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  failureCount: integer("failure_count").notNull().default(0),
});

/** Idempotency for Session Reminders: one per subscription per Session per start time. */
export const remindersSent = pgTable(
  "reminders_sent",
  {
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => pushSubscriptions.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    /** Reminders are keyed to the start time, so a moved Session can be reminded again. */
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.subscriptionId, t.sessionId, t.startsAt] })],
);

// ── FIA Documents (owned by the documents work) ────────────────────────────

/**
 * Each FIA Document seen for a Round while the sync watched it. Alerts push each one once, then set
 * notifiedAt; documents already old when first seen are stored with notifiedAt set, so never pushed.
 */
export const fiaDocuments = pgTable("fia_documents", {
  /** The PDF on fia.com. */
  url: text("url").primaryKey(),
  series: text("series").$type<FiaDocumentSeries>().notNull(),
  roundId: text("round_id").notNull(),
  /** The FIA's name for the Round, e.g. "Singapore Grand Prix" or "Baku". */
  event: text("event").notNull(),
  number: integer("number"),
  title: text("title").notNull(),
  kind: text("kind").$type<FiaDocumentKind>().notNull(),
  /** The file name our viewer opens; null for a PDF outside the FIA's document folder. */
  file: text("file"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
});
