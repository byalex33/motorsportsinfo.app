import { createECDH, randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/pg-proxy";
import webpush from "web-push";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import type { PushOutcome } from "./push";
import { CLAIM_LEASE_MS, PUSH_CHUNK, REMINDER_CHUNK, runAlerts } from "./run";
import { maxDuration } from "@/app/api/cron/alerts/route";

const vapid = { publicKey: "pub", privateKey: "priv", subject: "mailto:x@example.com" };
// Not 07:00 UTC, so the daily housekeeping and owner alert stay out of the way.
const NOW = new Date("2026-10-11T12:07:00Z");

type Rows = {
  sessions?: unknown[][];
  changes?: unknown[][];
  documents?: unknown[][];
  subscriptions?: unknown[][];
  /** What claiming a waiting FIA Document returns as how far an earlier run got. */
  documentSentThrough?: string | null;
};

/**
 * A database that records every statement and answers the alerts cron's "is anything due?" reads and the
 * subscriptions read with the given rows (positional, as the proxy driver expects). Every Session Reminder
 * offered is claimed (none was sent before); everything else returns no rows.
 */
function fakeDb(rows: Rows = {}) {
  const statements: string[] = [];
  const calls: { sql: string; params: unknown[] }[] = [];
  const progress: string[] = [];
  const db = drizzle(
    async (sql, params) => {
      statements.push(sql);
      calls.push({ sql, params });
      if (/^select .* from "sessions" inner join "rounds" .*"sessions"."status" = /.test(sql)) {
        return { rows: rows.sessions ?? [] };
      }
      if (/^select .* from "schedule_changes"/.test(sql)) return { rows: rows.changes ?? [] };
      if (/^select .* from "fia_documents"/.test(sql)) return { rows: rows.documents ?? [] };
      if (/^select .* from "push_subscriptions"/.test(sql)) return { rows: rows.subscriptions ?? [] };
      if (/^update "fia_documents" set "pending_until" = now\(\)/.test(sql)) {
        // Every waiting document is claimed, with url and sent_through returned.
        return { rows: (rows.documents ?? []).map((d) => [d[0], rows.documentSentThrough ?? null]) };
      }
      if (/^update "fia_documents" set "sent_through"/.test(sql)) progress.push(String(params[0]));
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
  const matching = (pattern: RegExp) => calls.filter((c) => pattern.test(c.sql));
  const documentFinishes = () => statements.filter((s) => /^update "fia_documents" set "(notified_at|pending_until)" = \$/.test(s));
  return { db: db as unknown as Db, statements, calls, matching, subscriptionReads, reminderClaims, claims, progress, documentFinishes };
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

/** A subscription following F1 Races with a 15-minute lead, so it is due a Session Reminder for DUE_RACE. */
function followerId(i: number): string {
  return `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
}

function raceFollower(i: number, endpoint = `https://fcm.googleapis.com/fcm/send/device-${i}`, failureCount = 0): unknown[] {
  return [followerId(i), endpoint, "p256dh", "auth", 15, { f1: ["race"] }, {}, "Europe/London", failureCount];
}

function raceFollowers(count: number): unknown[][] {
  return Array.from({ length: count }, (_, i) => raceFollower(i));
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
      ownerAlert: null,
      deadlineReached: false,
    });
  });

  it("never reads the database for passes planAlertsRun found no work for", async () => {
    const { db, statements } = fakeDb({ sessions: [DUE_RACE], changes: [WAITING_CHANGE], documents: [WAITING_DOCUMENT] });
    await runAlerts(db, vapid, NOW, { work: { reminders: false, pushes: false } });
    expect(statements).toEqual([]);
  });

  it("runs only the pushes pass when no reminder can be due", async () => {
    const { db, statements } = fakeDb({ changes: [WAITING_CHANGE] });
    await runAlerts(db, vapid, NOW, { work: { reminders: false, pushes: true }, send: async () => "sent" });
    expect(statements.some((s) => /from "sessions" inner join "rounds" .*"sessions"."status" = /.test(s))).toBe(false);
    expect(statements.some((s) => /^select .* from "schedule_changes"/.test(s))).toBe(true);
  });

  it("does its housekeeping only in the 07:00 UTC run", async () => {
    const deletes = (statements: string[]) => statements.filter((s) => /^delete from "(reminders_sent|fia_documents|push_signup_attempts)"/.test(s));
    const onTheHour = fakeDb();
    await runAlerts(onTheHour.db, vapid, new Date("2026-10-11T12:00:00Z"), { ownerEndpoint: null });
    expect(deletes(onTheHour.statements)).toEqual([]);
    const daily = fakeDb();
    await runAlerts(daily.db, vapid, new Date("2026-10-11T07:00:00Z"), { ownerEndpoint: null });
    expect(deletes(daily.statements)).toHaveLength(3);
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

describe("runAlerts fan-out", () => {
  const followers = PUSH_CHUNK * 2 + 50;
  const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  /** A subscription that wants every F1 document. */
  const documentFollower = (i: number) => [id(i), `https://fcm.googleapis.com/fcm/send/device-${i}`, "p256dh", "auth", 15, {}, { f1: "all" }, "UTC", 0];
  const documentFollowers = (count: number) => Array.from({ length: count }, (_, i) => documentFollower(i));

  it("holds a claim for as long as the alerts function may run", () => {
    expect(CLAIM_LEASE_MS).toBe(maxDuration * 1000);
  });

  it("pushes every device, saving how far it got after each chunk, then marks the document notified", async () => {
    const { db, progress, documentFinishes } = fakeDb({ documents: [WAITING_DOCUMENT], subscriptions: documentFollowers(followers) });
    const sent: string[] = [];
    const result = await runAlerts(db, vapid, NOW, {
      work: { reminders: false, pushes: true },
      send: async (push) => {
        sent.push(push.subscription.id);
        return "sent";
      },
    });
    expect(sent).toHaveLength(followers);
    expect(progress).toEqual([id(PUSH_CHUNK - 1), id(PUSH_CHUNK * 2 - 1)]);
    expect(documentFinishes()).toEqual([expect.stringMatching(/^update "fia_documents" set "notified_at" = \$1, "pending_until" = \$2/)]);
    expect(result.documents).toEqual({ processed: 1, pushes: followers, sent: followers });
  });

  it("stops at the deadline with what it sent saved, and releases the document unnotified for the next run", async () => {
    const { db, progress, documentFinishes } = fakeDb({ documents: [WAITING_DOCUMENT], subscriptions: documentFollowers(followers) });
    let t = 0;
    const sent: string[] = [];
    const result = await runAlerts(db, vapid, NOW, {
      work: { reminders: false, pushes: true },
      deadline: 10,
      clock: () => t,
      send: async (push) => {
        t += 1;
        sent.push(push.subscription.id);
        return "sent";
      },
    });
    expect(sent).toHaveLength(PUSH_CHUNK);
    expect(progress).toEqual([id(PUSH_CHUNK - 1)]);
    expect(documentFinishes()).toEqual([expect.stringMatching(/^update "fia_documents" set "pending_until" = \$1 where/)]);
    expect(result.documents.processed).toBe(0);
    expect(result.deadlineReached).toBe(true);
  });

  it("carries on after the last device an earlier run reached", async () => {
    const { db } = fakeDb({
      documents: [WAITING_DOCUMENT],
      subscriptions: documentFollowers(followers),
      documentSentThrough: id(PUSH_CHUNK - 1),
    });
    const sent: string[] = [];
    await runAlerts(db, vapid, NOW, {
      work: { reminders: false, pushes: true },
      send: async (push) => {
        sent.push(push.subscription.id);
        return "sent";
      },
    });
    expect(sent).toHaveLength(followers - PUSH_CHUNK);
    expect(sent[0]).toBe(id(PUSH_CHUNK));
  });
});

describe("runAlerts owner alert", () => {
  const OWNER = "https://fcm.googleapis.com/fcm/send/owner";
  // No source_checks rows: no Series has ever synced, so the sync is unhealthy.
  const owner = () => fakeDb({ subscriptions: [raceFollower(0, OWNER)] });
  const statusReads = (statements: string[]) => statements.filter((s) => /from "schedule_flags"/.test(s)).length;

  it("pushes the owner once at 07:00 UTC when the sync is unhealthy", async () => {
    const { db, statements } = owner();
    const sent: { endpoint: string; tag: string }[] = [];
    const result = await runAlerts(db, vapid, new Date("2026-10-11T07:00:00Z"), {
      ownerEndpoint: OWNER,
      send: async (push) => {
        sent.push({ endpoint: push.subscription.endpoint, tag: push.payload.tag });
        return "sent";
      },
    });
    expect(statusReads(statements)).toBe(1);
    expect(sent).toEqual([{ endpoint: OWNER, tag: "owner:sync-status" }]);
    expect(result.ownerAlert).toBe("sent");
  });

  it("does nothing at other times", async () => {
    const { db, statements } = owner();
    const result = await runAlerts(db, vapid, new Date("2026-10-11T07:01:00Z"), {
      ownerEndpoint: OWNER,
      send: async () => "sent",
    });
    expect(statusReads(statements)).toBe(0);
    expect(result.ownerAlert).toBeNull();
  });

  it("does nothing without an owner endpoint", async () => {
    const { db, statements } = owner();
    const result = await runAlerts(db, vapid, new Date("2026-10-11T07:00:00Z"), {
      ownerEndpoint: null,
      send: async () => "sent",
    });
    expect(statusReads(statements)).toBe(0);
    expect(result.ownerAlert).toBeNull();
  });
});

const FAILURE_COUNT_UP = /^update "push_subscriptions" set "failure_count" = "push_subscriptions"."failure_count" \+ 1/;
const FAILURE_COUNT_RESET = /^update "push_subscriptions" set "failure_count" = \$1/;
const SUBSCRIPTION_DELETE = /^delete from "push_subscriptions"/;
const REMINDER_RELEASE = /^delete from "reminders_sent"/;

/** A send that answers each follower (by index) with the given outcome. */
function sendOutcomes(outcomes: PushOutcome[]) {
  return async (push: { subscription: { id: string } }) => outcomes[Number(push.subscription.id.slice(-12))];
}

describe("runAlerts push outcomes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("counts a failed send against its subscription when other pushes went through", async () => {
    const { db, matching } = fakeDb({ sessions: [DUE_RACE], subscriptions: raceFollowers(2) });
    await runAlerts(db, vapid, NOW, { send: sendOutcomes(["failed", "sent"]) });
    const up = matching(FAILURE_COUNT_UP);
    expect(up).toHaveLength(1);
    expect(up[0].params).toEqual([followerId(0)]);
    expect(matching(SUBSCRIPTION_DELETE)).toHaveLength(1);
  });

  it("counts a single failed push", async () => {
    const { db, matching } = fakeDb({ sessions: [DUE_RACE], subscriptions: raceFollowers(1) });
    await runAlerts(db, vapid, NOW, { send: sendOutcomes(["failed"]) });
    expect(matching(FAILURE_COUNT_UP)).toHaveLength(1);
  });

  it("never counts an error against a subscription, and never resets its count either", async () => {
    const subscriptions = [raceFollower(0, undefined, 3), raceFollower(1, undefined, 2)];
    const { db, matching } = fakeDb({ sessions: [DUE_RACE], subscriptions });
    await runAlerts(db, vapid, NOW, { send: sendOutcomes(["error", "sent"]) });
    expect(matching(FAILURE_COUNT_UP)).toEqual([]);
    expect(matching(SUBSCRIPTION_DELETE)).toEqual([]);
    const reset = matching(FAILURE_COUNT_RESET);
    expect(reset).toHaveLength(1);
    expect(reset[0].params).toEqual([0, followerId(1)]);
  });

  it("counts nothing and logs one line when every push of a batch went wrong", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, matching } = fakeDb({ sessions: [DUE_RACE], subscriptions: raceFollowers(3) });
    const result = await runAlerts(db, vapid, NOW, { send: sendOutcomes(["failed", "error", "failed"]) });
    expect(matching(FAILURE_COUNT_UP)).toEqual([]);
    expect(matching(SUBSCRIPTION_DELETE)).toEqual([]);
    expect(result.subscriptionsRemoved).toBe(0);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toMatch(/every push in this batch went wrong \(1 error, 2 failed\)/);
  });

  it("deletes no subscription when a bad VAPID subject stops every send before it leaves", async () => {
    // Real subscription keys, so the payload encrypts and the real web-push gets as far as the VAPID check.
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const p256dh = ecdh.getPublicKey().toString("base64url");
    const auth = randomBytes(16).toString("base64url");
    const subscriptions = [0, 1].map((i) => {
      const row = raceFollower(i, undefined, 4);
      row[2] = p256dh;
      row[3] = auth;
      return row;
    });
    const keys = webpush.generateVAPIDKeys();
    const badVapid = { publicKey: keys.publicKey, privateKey: keys.privateKey, subject: "not a url" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, matching } = fakeDb({ sessions: [DUE_RACE], subscriptions });

    const result = await runAlerts(db, badVapid, NOW);

    expect(warn).toHaveBeenCalledWith("[alerts] push error", followerId(0), expect.stringMatching(/^Vapid subject is not a valid URL/));
    expect(result.reminders).toEqual({ due: 2, claimed: 2, sent: 0 });
    expect(matching(FAILURE_COUNT_UP)).toEqual([]);
    expect(matching(SUBSCRIPTION_DELETE)).toEqual([]);
    expect(result.subscriptionsRemoved).toBe(0);
  });
});

describe("runAlerts Session Reminder retry", () => {
  afterEach(() => vi.restoreAllMocks());

  it("releases the claims of reminders whose send did not go through, so the next run retries them", async () => {
    const { db, matching } = fakeDb({ sessions: [DUE_RACE], subscriptions: raceFollowers(4) });
    await runAlerts(db, vapid, NOW, { send: sendOutcomes(["sent", "error", "failed", "gone"]) });
    const release = matching(REMINDER_RELEASE);
    expect(release).toHaveLength(1);
    // Keyed like the claim: Session id, start time and the subscriptions that missed it.
    expect(release[0].sql).toMatch(/"session_id" = \$1 and "reminders_sent"."starts_at" = \$2 and "reminders_sent"."subscription_id" in \(\$3, \$4\)/);
    expect(release[0].params).toEqual([DUE_RACE[0], DUE_RACE[4], followerId(1), followerId(2)]);
  });

  it("releases nothing when every reminder went out", async () => {
    const { db, matching } = fakeDb({ sessions: [DUE_RACE], subscriptions: raceFollowers(2) });
    await runAlerts(db, vapid, NOW, { send: async () => "sent" });
    expect(matching(REMINDER_RELEASE)).toEqual([]);
  });

  it("keeps the run going when the release fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, matching } = fakeDb({ sessions: [DUE_RACE], subscriptions: raceFollowers(2) });
    const failing = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === "delete") {
          return (table: unknown) => {
            if (table === schema.remindersSent) throw new Error("connection lost");
            return target.delete(table as typeof schema.pushSubscriptions);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const result = await runAlerts(failing, vapid, NOW, { send: sendOutcomes(["error", "sent"]) });
    expect(result.reminders.sent).toBe(1);
    expect(matching(REMINDER_RELEASE)).toEqual([]);
    expect(error).toHaveBeenCalledWith("[alerts] could not release unsent Session Reminders for a retry", expect.any(Error));
  });
});
