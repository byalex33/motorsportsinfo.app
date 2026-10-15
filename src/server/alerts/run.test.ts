import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { REMINDER_CHUNK, runAlerts } from "./run";

const vapid = { publicKey: "pub", privateKey: "priv", subject: "mailto:x@example.com" };
// Not on the hour, so the hourly housekeeping stays out of the way.
const NOW = new Date("2026-10-11T12:07:00Z");

type Rows = {
  sessions?: unknown[][];
  changes?: unknown[][];
  documents?: unknown[][];
  subscriptions?: unknown[][];
};

/**
 * A database that records every statement and answers the alerts cron's "is anything due?" reads and the
 * subscriptions read with the given rows (positional, as the proxy driver expects). Every Session Reminder
 * offered is claimed (none was sent before); everything else returns no rows.
 */
function fakeDb(rows: Rows = {}) {
  const statements: string[] = [];
  const db = drizzle(
    async (sql, params) => {
      statements.push(sql);
      if (/^select .* from "sessions" inner join "rounds" .*"sessions"."status" = /.test(sql)) {
        return { rows: rows.sessions ?? [] };
      }
      if (/^select .* from "schedule_changes"/.test(sql)) return { rows: rows.changes ?? [] };
      if (/^select .* from "fia_documents"/.test(sql)) return { rows: rows.documents ?? [] };
      if (/^select .* from "push_subscriptions"/.test(sql)) return { rows: rows.subscriptions ?? [] };
      if (/^insert into "reminders_sent"/.test(sql)) {
        // Three parameters per row (subscription id, Session id, start time), echoed back as claimed.
        const claimed: unknown[][] = [];
        for (let i = 0; i < params.length; i += 3) claimed.push(params.slice(i, i + 3));
        return { rows: claimed };
      }
      return { rows: [] };
    },
    { schema },
  );
  const subscriptionReads = () => statements.filter((s) => /^select .* from "push_subscriptions"/.test(s)).length;
  const reminderClaims = () => statements.filter((s) => /^insert into "reminders_sent"/.test(s)).length;
  const claims = () =>
    statements.filter((s) => /^(insert into "reminders_sent"|update "schedule_changes"|update "fia_documents")/.test(s));
  return { db: db as unknown as Db, statements, subscriptionReads, reminderClaims, claims };
}

const DUE_RACE = [
  "f1-2026-x-race",
  "f1",
  "race",
  "Race",
  new Date(NOW.getTime() + 15 * 60_000).toISOString(),
  "scheduled",
  "Mexico City Grand Prix",
  true,
];
const WAITING_CHANGE = [1, "f1-2026-x-race", "f1", "cancelled", "2026-10-12T20:00:00Z", null];
const WAITING_DOCUMENT = [
  "https://www.fia.com/sites/default/files/decision-document/doc_1.pdf",
  "f1",
  "Mexico City Grand Prix",
  1,
  "Doc 1",
  "other",
  "doc_1.pdf",
  null,
];

/** Subscriptions following F1 Races with a 15-minute lead, so each is due a Session Reminder for DUE_RACE. */
function raceFollowers(count: number): unknown[][] {
  return Array.from({ length: count }, (_, i) => [
    `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    `https://fcm.googleapis.com/fcm/send/device-${i}`,
    "p256dh",
    "auth",
    15,
    { f1: ["race"] },
    {},
    "Europe/London",
    0,
  ]);
}

describe("runAlerts", () => {
  it("does not read any subscriptions when nothing is due", async () => {
    const { db, statements, subscriptionReads } = fakeDb();
    const result = await runAlerts(db, vapid, NOW);
    expect(subscriptionReads()).toBe(0);
    expect(statements).toHaveLength(3);
    expect(result).toEqual({
      reminders: { due: 0, claimed: 0, sent: 0 },
      changes: { processed: 0, pushes: 0, sent: 0 },
      documents: { processed: 0, pushes: 0, sent: 0 },
      subscriptionsRemoved: 0,
      deadlineReached: false,
    });
  });

  it("reads the subscriptions once when a Session is due for reminders", async () => {
    const { db, subscriptionReads } = fakeDb({ sessions: [DUE_RACE] });
    await runAlerts(db, vapid, NOW);
    expect(subscriptionReads()).toBe(1);
  });

  it("reads the subscriptions only once when Schedule Changes and FIA Documents are both waiting", async () => {
    const { db, subscriptionReads } = fakeDb({ changes: [WAITING_CHANGE], documents: [WAITING_DOCUMENT] });
    await runAlerts(db, vapid, NOW);
    expect(subscriptionReads()).toBe(1);
  });
});

describe("runAlerts deadline", () => {
  const followers = REMINDER_CHUNK * 2 + 5;

  it("claims nothing once the deadline has passed", async () => {
    const { db, claims } = fakeDb({
      sessions: [DUE_RACE],
      subscriptions: raceFollowers(3),
      changes: [WAITING_CHANGE],
      documents: [WAITING_DOCUMENT],
    });
    const sent: string[] = [];
    const result = await runAlerts(db, vapid, NOW, {
      deadline: 1_000,
      clock: () => 1_000,
      send: async (push) => {
        sent.push(push.subscription.id);
        return "sent";
      },
    });
    expect(claims()).toEqual([]);
    expect(sent).toEqual([]);
    expect(result.reminders).toEqual({ due: 3, claimed: 0, sent: 0 });
    expect(result.changes.processed).toBe(0);
    expect(result.documents.processed).toBe(0);
    expect(result.deadlineReached).toBe(true);
  });

  it("sends every Session Reminder it claimed before the deadline and leaves the rest unclaimed", async () => {
    const { db, reminderClaims } = fakeDb({ sessions: [DUE_RACE], subscriptions: raceFollowers(followers) });
    // Each send takes a second, so sending the first chunk runs past the deadline halfway through.
    let t = 0;
    const sent: string[] = [];
    const result = await runAlerts(db, vapid, NOW, {
      deadline: (REMINDER_CHUNK / 2) * 1_000,
      clock: () => t,
      send: async (push) => {
        t += 1_000;
        sent.push(push.subscription.id);
        return "sent";
      },
    });
    expect(reminderClaims()).toBe(1);
    expect(new Set(sent).size).toBe(REMINDER_CHUNK);
    expect(result.reminders).toEqual({ due: followers, claimed: REMINDER_CHUNK, sent: REMINDER_CHUNK });
    expect(result.deadlineReached).toBe(true);
  });

  it("claims and sends every due Session Reminder, a chunk at a time, when there is time", async () => {
    const { db, reminderClaims } = fakeDb({ sessions: [DUE_RACE], subscriptions: raceFollowers(followers) });
    const result = await runAlerts(db, vapid, NOW, { deadline: 1_000, clock: () => 0, send: async () => "sent" });
    expect(reminderClaims()).toBe(3);
    expect(result.reminders).toEqual({ due: followers, claimed: followers, sent: followers });
    expect(result.deadlineReached).toBe(false);
  });
});
