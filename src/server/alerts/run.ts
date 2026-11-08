// The alerts cron: sends due Session Reminders, unsent Schedule Change pushes and Document Alerts, and once a
// day the owner's sync alert. Reads the database only — never the schedule sources or fia.com.
import { and, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Db } from "@/db/client";
import { fiaDocuments, pushSubscriptions, remindersSent, rounds, scheduleChanges, sessions } from "@/db/schema";
import { REMINDER_LEAD_MINUTES } from "@/domain/series";
import { getSyncStatus } from "@/server/status";
import { planChangePushes, type ScheduleChangeRow } from "./changes";
import { planDocumentPushes, type DocumentAlertRow } from "./document-alerts";
import { OWNER_ALERT_TTL_SECONDS, getOwnerPushEndpoint, isOwnerAlertDue, ownerAlertPayload } from "./owner";
import { MAX_PUSH_FAILURES, PUSH_CONCURRENCY, mapWithConcurrency, sendPush, type PushOutcome, type VapidConfig } from "./push";
import { reminderKey, selectDueReminders, type DueReminder } from "./reminders";
import { pruneSignupAttempts } from "./subscriptions";
import type { AlertSession, AlertSubscription, OutgoingPush } from "./types";
import type { AlertsWork } from "./wake";

const MINUTE = 60_000;
const MAX_LEAD_MINUTES = Math.max(...REMINDER_LEAD_MINUTES);
/** reminders_sent rows are kept this long after their Session started, then pruned. */
const REMINDER_RETENTION_DAYS = 7;
/** fia_documents rows are kept this long after first being seen, then pruned. */
const DOCUMENT_RETENTION_DAYS = 30;
/**
 * Stop claiming new work this long after the run starts. The function may run for 300 s (route.ts), and a
 * chunk takes at most ~100 s (PUSH_CHUNK pushes, PUSH_CONCURRENCY at once, each given 10 s), so a chunk already
 * claimed has time to send; anything unclaimed waits for the next minute.
 */
export const RUN_BUDGET_MS = 45_000;
/**
 * How long a claim holds: as long as the function may run (route.ts). A claim still held after that belongs
 * to a run that ended before finishing, so a later run takes the work again: a lost run can delay a push but
 * never drop it. Pushes carry a tag, so one sent again replaces itself on the device rather than showing twice.
 */
export const CLAIM_LEASE_MS = 300_000;
/** Session Reminders claimed and sent together, so a run out of time has lost nothing it claimed. */
export const REMINDER_CHUNK = 100;
/** Schedule Change and Document Alert pushes sent between saves of how far a fan-out got (see fanOut). */
export const PUSH_CHUNK = 100;
const CHANGES_PER_RUN = 200;
const DOCUMENTS_PER_RUN = 200;
const INSERT_CHUNK = 500;

export interface AlertsRunResult {
  reminders: { due: number; claimed: number; sent: number };
  changes: { processed: number; pushes: number; sent: number };
  documents: { processed: number; pushes: number; sent: number };
  subscriptionsRemoved: number;
  /** The owner's daily sync alert, when one was sent this run. */
  ownerAlert: PushOutcome | null;
  /** True when the run stopped claiming work at its deadline, leaving the rest for the next run. */
  deadlineReached: boolean;
}

type SendFn = (push: OutgoingPush) => Promise<PushOutcome>;

export interface AlertsRunOptions {
  /** Epoch ms after which no new work is claimed. Default: RUN_BUDGET_MS after the run starts. */
  deadline?: number;
  /** The wall clock the deadline is checked against (tests pass a fake). Default: Date.now. */
  clock?: () => number;
  /** Sends one push. Default: Web Push with the VAPID keys. */
  send?: SendFn;
  /** The owner's push endpoint for the daily sync alert. Default: OWNER_PUSH_ENDPOINT; none turns it off. */
  ownerEndpoint?: string | null;
  /** Which passes may have work (planAlertsRun). A pass without any is skipped, never reading the database. Default: all. */
  work?: Partial<AlertsWork>;
}

/** Whether the run may still claim work. Records the first refusal, so the result can report it. */
interface Budget {
  hasTime(): boolean;
  reached: boolean;
}

function budget(deadline: number, clock: () => number): Budget {
  const b: Budget = {
    reached: false,
    hasTime() {
      if (clock() < deadline) return true;
      b.reached = true;
      return false;
    },
  };
  return b;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const subscriptionColumns = {
  id: pushSubscriptions.id,
  endpoint: pushSubscriptions.endpoint,
  p256dh: pushSubscriptions.p256dh,
  auth: pushSubscriptions.auth,
  leadMinutes: pushSubscriptions.leadMinutes,
  follows: pushSubscriptions.follows,
  documentAlerts: pushSubscriptions.documentAlerts,
  timeZone: pushSubscriptions.timeZone,
  failureCount: pushSubscriptions.failureCount,
};

async function loadSubscriptions(db: Db): Promise<AlertSubscription[]> {
  return db.select(subscriptionColumns).from(pushSubscriptions);
}

type LoadSubscriptions = () => Promise<AlertSubscription[]>;

/** Loads the subscriptions at most once per run, and only once something is due: most minutes nothing is. */
function lazySubscriptions(db: Db): LoadSubscriptions {
  let loading: Promise<AlertSubscription[]> | null = null;
  return () => (loading ??= loadSubscriptions(db));
}

const alertSessionColumns = {
  id: sessions.id,
  series: sessions.series,
  type: sessions.type,
  name: sessions.name,
  startsAt: sessions.startsAt,
  status: sessions.status,
  roundName: rounds.name,
  timesConfirmed: rounds.sessionTimesConfirmed,
};

/** Scheduled Sessions starting within the longest lead time. */
async function loadReminderSessions(db: Db, now: Date): Promise<AlertSession[]> {
  return db
    .select(alertSessionColumns)
    .from(sessions)
    .innerJoin(rounds, eq(rounds.id, sessions.roundId))
    .where(
      and(
        eq(sessions.status, "scheduled"),
        gt(sessions.startsAt, now),
        lte(sessions.startsAt, new Date(now.getTime() + MAX_LEAD_MINUTES * MINUTE)),
      ),
    );
}

type Sent = { push: OutgoingPush; outcome: PushOutcome };

/**
 * Sends pushes and records their outcomes straight away (failures counted, gone subscriptions deleted), so a
 * run that stops later has not lost what it learned. Keeps every result for the run's summary.
 */
export interface Sender {
  send(pushes: readonly OutgoingPush[]): Promise<Sent[]>;
  results: Sent[];
  removed: number;
}

function sender(db: Db, send: SendFn): Sender {
  const s: Sender = {
    results: [],
    removed: 0,
    async send(pushes) {
      if (pushes.length === 0) return [];
      const outcomes = await mapWithConcurrency(pushes, PUSH_CONCURRENCY, send);
      const sent = pushes.map((push, i) => ({ push, outcome: outcomes[i] }));
      s.results.push(...sent);
      s.removed += await recordOutcomes(db, sent);
      return sent;
    },
  };
  return s;
}

/** A claim's end, by the database's clock: CLAIM_LEASE_MS from now. */
const leaseEnd = sql`now() + ${sql.raw(String(CLAIM_LEASE_MS / 1000))} * interval '1 second'`;
/** No run holds the row: never claimed, finished, or its claim ran out. */
const unclaimed = (pendingUntil: AnyPgColumn) => or(isNull(pendingUntil), lt(pendingUntil, sql`now()`));

/**
 * Claims due reminders in reminders_sent and returns only the newly claimed: a new row, or one whose earlier
 * claim ran out before it was sent (insert … on conflict do update … where the claim has expired, returning).
 */
async function claimReminders<T extends { subscription: AlertSubscription; sessionId: string; startsAt: Date }>(
  db: Db,
  due: readonly T[],
): Promise<T[]> {
  const claimed = new Set<string>();
  for (const part of chunk(due, INSERT_CHUNK)) {
    const rows = await db
      .insert(remindersSent)
      .values(part.map((d) => ({ subscriptionId: d.subscription.id, sessionId: d.sessionId, startsAt: d.startsAt, pendingUntil: leaseEnd })))
      .onConflictDoUpdate({
        target: [remindersSent.subscriptionId, remindersSent.sessionId, remindersSent.startsAt],
        set: { pendingUntil: leaseEnd, sentAt: sql`now()` },
        setWhere: lt(remindersSent.pendingUntil, sql`now()`),
      })
      .returning({ subscriptionId: remindersSent.subscriptionId, sessionId: remindersSent.sessionId, startsAt: remindersSent.startsAt });
    for (const r of rows) claimed.add(reminderKey(r.subscriptionId, r.sessionId, r.startsAt));
  }
  return due.filter((d) => claimed.has(reminderKey(d.subscription.id, d.sessionId, d.startsAt)));
}

/** Marks claimed reminders as sent, so no later run takes them again. */
async function finishReminders(db: Db, done: readonly { subscription: AlertSubscription; sessionId: string; startsAt: Date }[]) {
  if (done.length === 0) return;
  await db
    .update(remindersSent)
    .set({ pendingUntil: null })
    .where(
      or(
        ...done.map((d) =>
          and(
            eq(remindersSent.subscriptionId, d.subscription.id),
            eq(remindersSent.sessionId, d.sessionId),
            eq(remindersSent.startsAt, d.startsAt),
          ),
        ),
      ),
    );
}

/**
 * Deletes the claims of reminders whose send did not go through ("error" or "failed"), so the next run sends
 * them again. This never loops: selectDueReminders only offers a reminder inside its catch-up window
 * (REMINDER_CATCH_UP_MINUTES after start − lead, and before the Session starts), so at most that many runs retry it.
 * A failed release only costs the retry, so it is logged and the run goes on.
 */
async function releaseReminders(db: Db, retry: readonly DueReminder[]): Promise<void> {
  if (retry.length === 0) return;
  // One condition per Session start, so the statement stays small however many devices missed it.
  const bySession = new Map<string, { sessionId: string; startsAt: Date; subscriptionIds: string[] }>();
  for (const r of retry) {
    const key = `${r.sessionId}|${r.startsAt.toISOString()}`;
    const group = bySession.get(key) ?? { sessionId: r.sessionId, startsAt: r.startsAt, subscriptionIds: [] };
    group.subscriptionIds.push(r.subscription.id);
    bySession.set(key, group);
  }
  try {
    for (const groups of chunk([...bySession.values()], INSERT_CHUNK)) {
      await db.delete(remindersSent).where(
        or(
          ...groups.map((g) =>
            and(
              eq(remindersSent.sessionId, g.sessionId),
              eq(remindersSent.startsAt, g.startsAt),
              inArray(remindersSent.subscriptionId, g.subscriptionIds),
            ),
          ),
        ),
      );
    }
  } catch (error) {
    console.error("[alerts] could not release unsent Session Reminders for a retry", error);
  }
}

/**
 * Claims and sends due reminders a chunk at a time, and claims no new chunk once out of time: a reminder is
 * only claimed when it is about to be sent, so one left over is still due (within the catch-up window) next run.
 * A chunk whose run ends before it is marked sent is claimed again once its lease runs out, and a claimed
 * reminder whose send did not go through is released again (releaseReminders), so it is retried too.
 */
async function runReminders(db: Db, subs: LoadSubscriptions, now: Date, out: Sender, time: Budget) {
  const reminderSessions = await loadReminderSessions(db, now);
  if (reminderSessions.length === 0) return { due: 0, claimed: 0, results: [] as Sent[] };
  const due = selectDueReminders(await subs(), reminderSessions, now);
  let claimed = 0;
  const results: Sent[] = [];
  for (const part of chunk(due, REMINDER_CHUNK)) {
    if (!time.hasTime()) break;
    const fresh = await claimReminders(db, part);
    claimed += fresh.length;
    const sent = await out.send(fresh);
    results.push(...sent);
    const retry = new Set(sent.filter((r) => r.outcome === "error" || r.outcome === "failed").map((r) => r.push));
    await finishReminders(db, fresh.filter((d) => !retry.has(d)));
    await releaseReminders(db, fresh.filter((d) => retry.has(d)));
  }
  return { due: due.length, claimed, results };
}

/** Subscriptions in id order: the order a fan-out walks them in, so `sentThrough` says where it stopped. */
function byId(subscriptions: readonly AlertSubscription[]): AlertSubscription[] {
  return [...subscriptions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Claimed rows that share a starting point: new ones, or ones an earlier run stopped partway through. */
function groupBySentThrough<T extends { sentThrough: string | null }>(rows: readonly T[]): T[][] {
  const groups = new Map<string | null, T[]>();
  for (const row of rows) groups.set(row.sentThrough, [...(groups.get(row.sentThrough) ?? []), row]);
  return [...groups.values()];
}

/**
 * Sends one batch's pushes device by device in id order, starting after `after`, about PUSH_CHUNK pushes at a
 * time (a device's pushes are never split). After each chunk `saveProgress` records the last device done, so a
 * run that stops (out of time, or ended) loses nothing it claimed: the next run carries on from there. Returns
 * whether every device was reached.
 */
export async function fanOut(
  subscriptions: readonly AlertSubscription[],
  after: string | null,
  plan: (subscriptions: readonly AlertSubscription[]) => OutgoingPush[],
  saveProgress: (lastDone: string) => Promise<void>,
  out: Pick<Sender, "send">,
  time: Pick<Budget, "hasTime">,
): Promise<boolean> {
  const remaining = byId(subscriptions).filter((s) => after === null || s.id > after);
  const pushesFor = new Map<string, OutgoingPush[]>();
  for (const push of plan(remaining)) {
    const id = push.subscription.id;
    pushesFor.set(id, [...(pushesFor.get(id) ?? []), push]);
  }
  let pending: OutgoingPush[] = [];
  for (const [i, subscription] of remaining.entries()) {
    pending.push(...(pushesFor.get(subscription.id) ?? []));
    const isLast = i === remaining.length - 1;
    if (pending.length < PUSH_CHUNK && !isLast) continue;
    if (pending.length === 0) break;
    if (!time.hasTime()) return false;
    await out.send(pending);
    pending = [];
    if (!isLast) await saveProgress(subscription.id);
  }
  return true;
}

async function runChanges(db: Db, subs: LoadSubscriptions, now: Date, out: Sender, time: Budget) {
  const none = { processed: 0, results: [] as Sent[] };
  if (!time.hasTime()) return none;
  const rows: ScheduleChangeRow[] = await db
    .select({
      id: scheduleChanges.id,
      sessionId: scheduleChanges.sessionId,
      series: scheduleChanges.series,
      kind: scheduleChanges.kind,
      previousStartsAt: scheduleChanges.previousStartsAt,
      newStartsAt: scheduleChanges.newStartsAt,
    })
    .from(scheduleChanges)
    .where(and(isNull(scheduleChanges.notifiedAt), unclaimed(scheduleChanges.pendingUntil)))
    .orderBy(scheduleChanges.id)
    .limit(CHANGES_PER_RUN);
  if (rows.length === 0) return none;

  const sessionIds = [...new Set(rows.map((r) => r.sessionId))];
  const sessionRows = await db
    .select(alertSessionColumns)
    .from(sessions)
    .innerJoin(rounds, eq(rounds.id, sessions.roundId))
    .where(inArray(sessions.id, sessionIds));
  const sessionsById = new Map(sessionRows.map((s) => [s.id, s]));
  // Loaded before claiming, so a failed read leaves the changes for the next run.
  const subscriptions = await subs();

  if (!time.hasTime()) return none;
  // Claimed for CLAIM_LEASE_MS, so overlapping runs never push one twice; notifiedAt is set once all are sent.
  const claimed = await db
    .update(scheduleChanges)
    .set({ pendingUntil: leaseEnd })
    .where(
      and(
        inArray(scheduleChanges.id, rows.map((r) => r.id)),
        isNull(scheduleChanges.notifiedAt),
        unclaimed(scheduleChanges.pendingUntil),
      ),
    )
    .returning({ id: scheduleChanges.id, sentThrough: scheduleChanges.sentThrough });
  const sentThrough = new Map(claimed.map((r) => [r.id, r.sentThrough]));
  const mine = rows.filter((r) => sentThrough.has(r.id)).map((r) => ({ ...r, sentThrough: sentThrough.get(r.id) ?? null }));

  const before = out.results.length;
  let processed = 0;
  for (const group of groupBySentThrough(mine)) {
    const ids = group.map((r) => r.id);
    const complete = await fanOut(
      subscriptions,
      group[0].sentThrough,
      (s) => planChangePushes(group, sessionsById, s, now).pushes,
      async (lastDone) => {
        await db.update(scheduleChanges).set({ sentThrough: lastDone }).where(inArray(scheduleChanges.id, ids));
      },
      out,
      time,
    );
    await db
      .update(scheduleChanges)
      .set(complete ? { notifiedAt: now, pendingUntil: null } : { pendingUntil: null })
      .where(inArray(scheduleChanges.id, ids));
    if (complete) processed += ids.length;
  }
  return { processed, results: out.results.slice(before) };
}

async function runDocuments(db: Db, subs: LoadSubscriptions, now: Date, out: Sender, time: Budget) {
  const none = { processed: 0, results: [] as Sent[] };
  if (!time.hasTime()) return none;
  const rows: DocumentAlertRow[] = await db
    .select({
      url: fiaDocuments.url,
      series: fiaDocuments.series,
      event: fiaDocuments.event,
      number: fiaDocuments.number,
      title: fiaDocuments.title,
      kind: fiaDocuments.kind,
      file: fiaDocuments.file,
      publishedAt: fiaDocuments.publishedAt,
    })
    .from(fiaDocuments)
    .where(and(isNull(fiaDocuments.notifiedAt), unclaimed(fiaDocuments.pendingUntil)))
    .orderBy(fiaDocuments.firstSeenAt)
    .limit(DOCUMENTS_PER_RUN);
  if (rows.length === 0) return none;
  const subscriptions = await subs();
  if (!time.hasTime()) return none;

  // Claimed for CLAIM_LEASE_MS, so overlapping runs never push a document twice; notifiedAt is set once all are sent.
  const claimed = await db
    .update(fiaDocuments)
    .set({ pendingUntil: leaseEnd })
    .where(
      and(
        inArray(fiaDocuments.url, rows.map((r) => r.url)),
        isNull(fiaDocuments.notifiedAt),
        unclaimed(fiaDocuments.pendingUntil),
      ),
    )
    .returning({ url: fiaDocuments.url, sentThrough: fiaDocuments.sentThrough });
  const sentThrough = new Map(claimed.map((r) => [r.url, r.sentThrough]));
  const mine = rows.filter((r) => sentThrough.has(r.url)).map((r) => ({ ...r, sentThrough: sentThrough.get(r.url) ?? null }));

  const before = out.results.length;
  let processed = 0;
  for (const group of groupBySentThrough(mine)) {
    const urls = group.map((r) => r.url);
    const complete = await fanOut(
      subscriptions,
      group[0].sentThrough,
      (s) => planDocumentPushes(group, s),
      async (lastDone) => {
        await db.update(fiaDocuments).set({ sentThrough: lastDone }).where(inArray(fiaDocuments.url, urls));
      },
      out,
      time,
    );
    await db
      .update(fiaDocuments)
      .set(complete ? { notifiedAt: now, pendingUntil: null } : { pendingUntil: null })
      .where(inArray(fiaDocuments.url, urls));
    if (complete) processed += urls.length;
  }
  return { processed, results: out.results.slice(before) };
}

/** At 07:00 UTC, one push to the owner's own subscription if the schedule sync is unhealthy. */
async function runOwnerAlert(db: Db, endpoint: string | null, now: Date, out: Sender, time: Budget) {
  if (!endpoint || !isOwnerAlertDue(now) || !time.hasTime()) return [];
  const payload = ownerAlertPayload(await getSyncStatus(db, now));
  if (!payload) return [];
  const [subscription] = await db
    .select(subscriptionColumns)
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
  if (!subscription) {
    console.warn("[alerts] OWNER_PUSH_ENDPOINT matches no push subscription");
    return [];
  }
  return out.send([{ subscription, payload, ttlSeconds: OWNER_ALERT_TTL_SECONDS }]);
}

/**
 * Deletes gone subscriptions, counts "failed" sends (deleting after MAX_PUSH_FAILURES), resets the count on
 * success. An "error" says nothing about the subscription, so it neither counts nor resets. When every push of
 * a run went wrong, the fault is ours or the push service's (a bad VAPID key, an outage), not every device's:
 * nothing is counted, so a bad deploy cannot delete every subscription.
 */
async function recordOutcomes(db: Db, results: { push: OutgoingPush; outcome: PushOutcome }[]): Promise<number> {
  const gone = new Set<string>();
  const failed = new Set<string>();
  const recovered = new Set<string>();
  for (const { push, outcome } of results) {
    const sub = push.subscription;
    if (outcome === "gone") gone.add(sub.id);
    else if (outcome === "failed") failed.add(sub.id);
    else if (outcome === "sent" && sub.failureCount > 0) recovered.add(sub.id);
  }
  const wrong = results.filter((r) => r.outcome === "error" || r.outcome === "failed").length;
  if (results.length > 1 && wrong === results.length) {
    const errors = results.filter((r) => r.outcome === "error").length;
    console.error(
      `[alerts] every push in this batch went wrong (${errors} error, ${wrong - errors} failed): not counting them against subscriptions`,
    );
    failed.clear();
  }
  for (const id of gone) {
    failed.delete(id);
    recovered.delete(id);
  }
  for (const id of failed) recovered.delete(id);

  let removed = 0;
  if (failed.size > 0) {
    await db
      .update(pushSubscriptions)
      .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
      .where(inArray(pushSubscriptions.id, [...failed]));
    const dropped = await db
      .delete(pushSubscriptions)
      .where(and(inArray(pushSubscriptions.id, [...failed]), gte(pushSubscriptions.failureCount, MAX_PUSH_FAILURES)))
      .returning({ id: pushSubscriptions.id });
    removed += dropped.length;
  }
  if (gone.size > 0) {
    const dropped = await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.id, [...gone]))
      .returning({ id: pushSubscriptions.id });
    removed += dropped.length;
  }
  if (recovered.size > 0) {
    await db.update(pushSubscriptions).set({ failureCount: 0 }).where(inArray(pushSubscriptions.id, [...recovered]));
  }
  return removed;
}

export async function runAlerts(
  db: Db,
  vapid: VapidConfig,
  now: Date = new Date(),
  options: AlertsRunOptions = {},
): Promise<AlertsRunResult> {
  const clock = options.clock ?? Date.now;
  const time = budget(options.deadline ?? clock() + RUN_BUDGET_MS, clock);
  const out = sender(db, options.send ?? ((push) => sendPush(push, vapid)));
  const subs = lazySubscriptions(db);
  const work: AlertsWork = { reminders: true, pushes: true, daily: isOwnerAlertDue(now), ...options.work };
  const none = { due: 0, claimed: 0, processed: 0, results: [] };

  const reminders = work.reminders ? await runReminders(db, subs, now, out, time) : none;
  const changes = work.pushes ? await runChanges(db, subs, now, out, time) : none;
  const documents = work.pushes ? await runDocuments(db, subs, now, out, time) : none;
  const ownerEndpoint = options.ownerEndpoint === undefined ? getOwnerPushEndpoint() : options.ownerEndpoint;
  const owner = await runOwnerAlert(db, ownerEndpoint, now, out, time);

  // Daily housekeeping, in the 07:00 UTC run: old reminder keys and documents are never needed again.
  if (work.daily) {
    await db
      .delete(remindersSent)
      .where(lt(remindersSent.startsAt, new Date(now.getTime() - REMINDER_RETENTION_DAYS * 24 * 60 * MINUTE)));
    await db
      .delete(fiaDocuments)
      .where(lt(fiaDocuments.firstSeenAt, new Date(now.getTime() - DOCUMENT_RETENTION_DAYS * 24 * 60 * MINUTE)));
    await pruneSignupAttempts(db);
  }

  const sentCount = (rs: { outcome: PushOutcome }[]) => rs.filter((r) => r.outcome === "sent").length;
  return {
    reminders: { due: reminders.due, claimed: reminders.claimed, sent: sentCount(reminders.results) },
    changes: { processed: changes.processed, pushes: changes.results.length, sent: sentCount(changes.results) },
    documents: { processed: documents.processed, pushes: documents.results.length, sent: sentCount(documents.results) },
    subscriptionsRemoved: out.removed,
    ownerAlert: owner[0]?.outcome ?? null,
    deadlineReached: time.reached,
  };
}
