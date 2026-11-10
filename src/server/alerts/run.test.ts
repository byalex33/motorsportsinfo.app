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
  /**
   * Keep Session Reminder claims across runs on this database, as reminders_sent would: a claim is taken
   * once and held until released. Without it, every reminder offered is claimed.
   */
  trackClaims?: boolean;
  /** Statements matching this throw, as a database fault would. */
  failOn?: RegExp;
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
  /** reminders_sent claims held (trackClaims), as "subscription|Session|start". */
  const held = new Set<string>();
  /** daily_runs: the UTC days a daily run was claimed for. */
  const dailyRuns = new Set<string>();
  /** Each subscription's failure_count, as counted by the run. */
  const failureCounts = new Map<string, number>();
  const db = drizzle(
    async (sql, params) => {
      statements.push(sql);
      calls.push({ sql, params });
      if (rows.failOn?.test(sql)) throw new Error("connection lost");
      if (/^insert into "daily_runs"/.test(sql)) {
        const day = String(params[0]);
        if (dailyRuns.has(day)) return { rows: [] };
        dailyRuns.add(day);
        return { rows: [[day]] };
      }
      if (/^delete from "daily_runs"/.test(sql)) dailyRuns.delete(String(params[0]));
      if (/^update "push_subscriptions" set "failure_count" = "push_subscriptions"."failure_count" \+ 1/.test(sql)) {
        for (const id of params) failureCounts.set(String(id), (failureCounts.get(String(id)) ?? 0) + 1);
      }
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
        for (let i = 0; i < params.length; i += 3) {
          const key = params.slice(i, i + 3).join("|");
          if (rows.trackClaims && held.has(key)) continue;
          held.add(key);
          claimed.push(params.slice(i, i + 3));
        }
        return { rows: claimed };
      }
      if (/^delete from "push_subscriptions" where "push_subscriptions"."id" in \([^)]*\) returning/.test(sql)) {
        // Gone subscriptions: every one is deleted.
        return { rows: params.map((id) => [id]) };
      }
      if (rows.trackClaims && /^delete from "reminders_sent"/.test(sql)) {
        // One Session start: its id, its start time, then the subscriptions released.
        const [sessionId, startsAt, ...subscriptionIds] = params;
        for (const id of subscriptionIds) held.delete([id, sessionId, startsAt].join("|"));
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
  return {
    db: db as unknown as Db,
    statements,
    calls,
    matching,
    subscriptionReads,
    reminderClaims,
    claims,
    progress,
    documentFinishes,
    failureCounts,
  };
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
  // First seen a minute ago, as the documents sync records it.
  new Date(NOW.getTime() - 60_000).toISOString(),
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

  it("does its housekeeping once a day, in the first run of the 07:00 UTC hour", async () => {
    const deletes = (statements: string[]) =>
      statements.filter((s) => /^delete from "(reminders_sent|fia_documents|push_signup_attempts|push_subscriptions)"/.test(s));
    const onTheHour = fakeDb();
    await runAlerts(onTheHour.db, vapid, new Date("2026-10-11T12:00:00Z"), { ownerEndpoint: null });
    expect(deletes(onTheHour.statements)).toEqual([]);
    const daily = fakeDb();
    await runAlerts(daily.db, vapid, new Date("2026-10-11T07:03:00Z"), { ownerEndpoint: null });
    expect(deletes(daily.statements)).toHaveLength(4);
    daily.statements.length = 0;
    await runAlerts(daily.db, vapid, new Date("2026-10-11T07:04:00Z"), { ownerEndpoint: null });
    expect(deletes(daily.statements)).toEqual([]);
  });

  it("prunes subscriptions not saved or pushed to for 400 days", async () => {
    const { matching } = await (async () => {
      const f = fakeDb();
      await runAlerts(f.db, vapid, new Date("2026-10-11T07:00:00Z"), { ownerEndpoint: null });
      return f;
    })();
    const prune = matching(/^delete from "push_subscriptions"/);
    expect(prune).toHaveLength(1);
    expect(prune[0].sql).toMatch(/"updated_at" < now\(\) - interval '400 days'/);
    expect(prune[0].sql).toMatch(/"last_sent_at" is null or "push_subscriptions"."last_sent_at" < now\(\) - interval '400 days'/);
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

  it("does nothing outside the 07:00 UTC hour", async () => {
    for (const at of ["2026-10-11T06:59:00Z", "2026-10-11T08:00:00Z"]) {
      const { db, statements } = owner();
      const result = await runAlerts(db, vapid, new Date(at), { ownerEndpoint: OWNER, send: async () => "sent" });
      expect(statusReads(statements)).toBe(0);
      expect(result.ownerAlert).toBeNull();
    }
  });

  it("is sent by a late run in the 07:00 hour when no daily run is recorded, and only once that day", async () => {
    const { db, statements } = owner();
    const sent: string[] = [];
    const send = async (push: { payload: { tag: string } }) => {
      sent.push(push.payload.tag);
      return "sent" as const;
    };
    const first = await runAlerts(db, vapid, new Date("2026-10-11T07:03:00Z"), { ownerEndpoint: OWNER, send });
    expect(first.ownerAlert).toBe("sent");
    const second = await runAlerts(db, vapid, new Date("2026-10-11T07:04:00Z"), { ownerEndpoint: OWNER, send });
    expect(second.ownerAlert).toBeNull();
    expect(sent).toEqual(["owner:sync-status"]);
    expect(statusReads(statements)).toBe(1);
  });

  it("is sent before the reminders pass, so a database fault there does not lose it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb({ subscriptions: [raceFollower(0, OWNER)], failOn: /from "sessions" inner join "rounds"/ });
    const sent: string[] = [];
    const run = runAlerts(db, vapid, new Date("2026-10-11T07:00:00Z"), {
      ownerEndpoint: OWNER,
      send: async (push) => {
        sent.push(push.payload.tag);
        return "sent";
      },
    });
    await expect(run).rejects.toThrow(/Failed query/);
    expect(sent).toEqual(["owner:sync-status"]);
    vi.restoreAllMocks();
  });

  it("logs a failed daily pass, releases the day for the next run, and goes on to the reminders", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, statements } = fakeDb({ sessions: [DUE_RACE], subscriptions: raceFollowers(1), failOn: /from "schedule_flags"/ });
    const result = await runAlerts(db, vapid, new Date("2026-10-11T07:00:00Z"), { ownerEndpoint: OWNER, send: async () => "sent" });
    expect(error).toHaveBeenCalledWith("[alerts] the daily pass failed; the next run tries again", expect.any(Error));
    expect(statements.some((s) => /^delete from "daily_runs"/.test(s))).toBe(true);
    expect(result.ownerAlert).toBeNull();
    vi.restoreAllMocks();
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

  it("releases the claims of reminders whose send got no answer, so the next run retries them", async () => {
    const { db, matching } = fakeDb({ sessions: [DUE_RACE], subscriptions: raceFollowers(4) });
    await runAlerts(db, vapid, NOW, { send: sendOutcomes(["sent", "error", "failed", "gone"]) });
    const release = matching(REMINDER_RELEASE);
    expect(release).toHaveLength(1);
    // Keyed like the claim: Session id, start time and the subscriptions that missed it.
    // Only the error: a failed send is a strike, and is not retried (see "a refused Session Reminder").
    expect(release[0].sql).toMatch(/"session_id" = \$1 and "reminders_sent"."starts_at" = \$2 and "reminders_sent"."subscription_id" in \(\$3\)/);
    expect(release[0].params).toEqual([DUE_RACE[0], DUE_RACE[4], followerId(1)]);
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

describe("runAlerts a refused Session Reminder", () => {
  afterEach(() => vi.restoreAllMocks());

  it("costs its subscription one strike, however many runs it stays due for", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db, matching, failureCounts } = fakeDb({ sessions: [DUE_RACE], subscriptions: raceFollowers(1), trackClaims: true });
    // Five runs a minute apart, all inside the reminder's catch-up window, each refused by the push service.
    for (let minute = 0; minute < 5; minute++) {
      await runAlerts(db, vapid, new Date(NOW.getTime() + minute * 60_000), { send: async () => "failed" });
    }
    expect(failureCounts.get(followerId(0))).toBe(1);
    expect(matching(REMINDER_RELEASE)).toEqual([]);
  });

  it("is still retried after an error, which says nothing about the subscription", async () => {
    const { db, reminderClaims } = fakeDb({ sessions: [DUE_RACE], subscriptions: raceFollowers(1), trackClaims: true });
    const outcomes: PushOutcome[] = ["error", "sent", "sent"];
    const results = [];
    for (let minute = 0; minute < 3; minute++) {
      const send = async () => outcomes[minute];
      results.push(await runAlerts(db, vapid, new Date(NOW.getTime() + minute * 60_000), { send }));
    }
    expect(results.map((r) => r.reminders.claimed)).toEqual([1, 1, 0]);
    expect(reminderClaims()).toBe(3);
  });
});

describe("runAlerts late work", () => {
  afterEach(() => vi.restoreAllMocks());

  it("marks an FIA Document recorded too long ago as notified without pushing it", async () => {
    const info = vi.spyOn(console, "warn").mockImplementation(() => {});
    // The alerts cron was down: the document was recorded two hours ago.
    const old = [...WAITING_DOCUMENT.slice(0, 8), new Date(NOW.getTime() - 2 * 60 * 60_000).toISOString()];
    const { db, matching } = fakeDb({ documents: [old], subscriptions: [[followerId(0), "https://fcm.googleapis.com/fcm/send/d", "p256dh", "auth", 15, {}, { f1: "all" }, "UTC", 0]] });
    const sent: string[] = [];
    const result = await runAlerts(db, vapid, NOW, {
      work: { reminders: false, pushes: true },
      send: async (push) => {
        sent.push(push.subscription.id);
        return "sent";
      },
    });
    expect(sent).toEqual([]);
    const skipped = matching(/^update "fia_documents" set "notified_at" = \$1, "pending_until" = \$2 where/);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].params).toContain(WAITING_DOCUMENT[0]);
    expect(result.documents).toEqual({ processed: 1, pushes: 0, sent: 0 });
    expect(info).toHaveBeenCalledWith("[alerts] 1 FIA Documents were recorded too long ago to push: marked notified");
  });

  it("still pushes an FIA Document recorded a minute ago", async () => {
    const { db } = fakeDb({ documents: [WAITING_DOCUMENT], subscriptions: [[followerId(0), "https://fcm.googleapis.com/fcm/send/d", "p256dh", "auth", 15, {}, { f1: "all" }, "UTC", 0]] });
    const result = await runAlerts(db, vapid, NOW, { work: { reminders: false, pushes: true }, send: async () => "sent" });
    expect(result.documents).toEqual({ processed: 1, pushes: 1, sent: 1 });
  });

  it("logs how many due Session Reminders it had no time to send", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const followers = REMINDER_CHUNK * 2 + 5;
    const { db } = fakeDb({ sessions: [DUE_RACE], subscriptions: raceFollowers(followers) });
    let t = 0;
    await runAlerts(db, vapid, NOW, {
      deadline: 1,
      clock: () => t,
      send: async () => {
        t = 2;
        return "sent";
      },
    });
    expect(warn).toHaveBeenCalledWith(`[alerts] ${followers - REMINDER_CHUNK} reminders not sent this run`);
  });

  it("does not claim reminders for a subscription an earlier chunk found gone", async () => {
    const DUE_QUALIFYING = ["f1-2026-x-qualifying", "f1", "qualifying", "Qualifying", DUE_RACE[4], "scheduled", "Mexico City Grand Prix", true];
    // Follower 0 follows Qualifying only and the rest both Sessions, so follower 50's two reminders straddle
    // the first chunk's end: one in it, one in the next.
    const subscriptions = raceFollowers(REMINDER_CHUNK).map((row, i) => {
      const copy = [...row];
      copy[5] = i === 0 ? { f1: ["qualifying"] } : { f1: ["qualifying", "race"] };
      return copy;
    });
    const gone = followerId(REMINDER_CHUNK / 2);
    const { db, matching } = fakeDb({ sessions: [DUE_RACE, DUE_QUALIFYING], subscriptions });
    await runAlerts(db, vapid, NOW, { send: async (push) => (push.subscription.id === gone ? "gone" : "sent") });
    const claims = matching(/^insert into "reminders_sent"/);
    expect(claims.length).toBeGreaterThan(1);
    expect(claims[0].params).toContain(gone);
    for (const later of claims.slice(1)) expect(later.params).not.toContain(gone);
  });

  it("records when the push service last accepted a push to a subscription", async () => {
    const { db, matching } = fakeDb({ sessions: [DUE_RACE], subscriptions: raceFollowers(2) });
    await runAlerts(db, vapid, NOW, { send: sendOutcomes(["sent", "failed"]) });
    const seen = matching(/^update "push_subscriptions" set "last_sent_at" = now\(\)/);
    expect(seen).toHaveLength(1);
    expect(seen[0].params).toEqual([followerId(0)]);
  });
});
