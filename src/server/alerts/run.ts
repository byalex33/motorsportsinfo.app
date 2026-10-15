// The alerts cron: sends due Session Reminders, unsent Schedule Change pushes and Document Alerts.
// Reads the database only — never the schedule sources or fia.com.
import { and, eq, gt, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { fiaDocuments, pushSubscriptions, remindersSent, rounds, scheduleChanges, sessions } from "@/db/schema";
import { REMINDER_LEAD_MINUTES } from "@/domain/series";
import { planChangePushes, type ScheduleChangeRow } from "./changes";
import { planDocumentPushes, type DocumentAlertRow } from "./document-alerts";
import { MAX_PUSH_FAILURES, PUSH_CONCURRENCY, mapWithConcurrency, sendPush, type PushOutcome, type VapidConfig } from "./push";
import { reminderKey, selectDueReminders } from "./reminders";
import type { AlertSession, AlertSubscription, OutgoingPush } from "./types";

const MINUTE = 60_000;
const MAX_LEAD_MINUTES = Math.max(...REMINDER_LEAD_MINUTES);
/** reminders_sent rows are kept this long after their Session started, then pruned. */
const REMINDER_RETENTION_DAYS = 7;
/** fia_documents rows are kept this long after first being seen, then pruned. */
const DOCUMENT_RETENTION_DAYS = 30;
/**
 * Stop claiming new work this long after the run starts. The function may run for 60 s (route.ts),
 * so a chunk already claimed still has time to send; anything unclaimed waits for the next minute.
 */
export const RUN_BUDGET_MS = 45_000;
/** Session Reminders claimed and sent together, so a run out of time has lost nothing it claimed. */
export const REMINDER_CHUNK = 100;
const CHANGES_PER_RUN = 200;
const DOCUMENTS_PER_RUN = 200;
const INSERT_CHUNK = 500;

export interface AlertsRunResult {
  reminders: { due: number; claimed: number; sent: number };
  changes: { processed: number; pushes: number; sent: number };
  documents: { processed: number; pushes: number; sent: number };
  subscriptionsRemoved: number;
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

async function loadSubscriptions(db: Db): Promise<AlertSubscription[]> {
  return db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      leadMinutes: pushSubscriptions.leadMinutes,
      follows: pushSubscriptions.follows,
      documentAlerts: pushSubscriptions.documentAlerts,
      timeZone: pushSubscriptions.timeZone,
      failureCount: pushSubscriptions.failureCount,
    })
    .from(pushSubscriptions);
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

async function sendAll(pushes: readonly OutgoingPush[], send: SendFn) {
  const outcomes = await mapWithConcurrency(pushes, PUSH_CONCURRENCY, send);
  return pushes.map((push, i) => ({ push, outcome: outcomes[i] }));
}

/** Claims due reminders in reminders_sent (insert … on conflict do nothing returning) and returns only the newly claimed. */
async function claimReminders<T extends { subscription: AlertSubscription; sessionId: string; startsAt: Date }>(
  db: Db,
  due: readonly T[],
): Promise<T[]> {
  const claimed = new Set<string>();
  for (const part of chunk(due, INSERT_CHUNK)) {
    const rows = await db
      .insert(remindersSent)
      .values(part.map((d) => ({ subscriptionId: d.subscription.id, sessionId: d.sessionId, startsAt: d.startsAt })))
      .onConflictDoNothing()
      .returning({ subscriptionId: remindersSent.subscriptionId, sessionId: remindersSent.sessionId, startsAt: remindersSent.startsAt });
    for (const r of rows) claimed.add(reminderKey(r.subscriptionId, r.sessionId, r.startsAt));
  }
  return due.filter((d) => claimed.has(reminderKey(d.subscription.id, d.sessionId, d.startsAt)));
}

/** Claims unnotified Schedule Changes by setting notifiedAt, so overlapping runs never push one twice. */
async function claimChanges(db: Db, ids: readonly number[], now: Date): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .update(scheduleChanges)
    .set({ notifiedAt: now })
    .where(and(inArray(scheduleChanges.id, [...ids]), isNull(scheduleChanges.notifiedAt)))
    .returning({ id: scheduleChanges.id });
  return new Set(rows.map((r) => r.id));
}

/**
 * Claims and sends due reminders a chunk at a time, and claims no new chunk once out of time: a reminder is
 * only claimed when it is about to be sent, so one left over is still due (within the catch-up window) next run.
 */
async function runReminders(db: Db, subs: LoadSubscriptions, now: Date, send: SendFn, time: Budget) {
  const reminderSessions = await loadReminderSessions(db, now);
  if (reminderSessions.length === 0) return { due: 0, claimed: 0, results: [] };
  const due = selectDueReminders(await subs(), reminderSessions, now);
  let claimed = 0;
  const results: { push: OutgoingPush; outcome: PushOutcome }[] = [];
  for (const part of chunk(due, REMINDER_CHUNK)) {
    if (!time.hasTime()) break;
    const fresh = await claimReminders(db, part);
    claimed += fresh.length;
    results.push(...(await sendAll(fresh, send)));
  }
  return { due: due.length, claimed, results };
}

async function runChanges(db: Db, subs: LoadSubscriptions, now: Date, send: SendFn, time: Budget) {
  if (!time.hasTime()) return { processed: 0, results: [] };
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
    .where(isNull(scheduleChanges.notifiedAt))
    .orderBy(scheduleChanges.id)
    .limit(CHANGES_PER_RUN);
  if (rows.length === 0) return { processed: 0, results: [] };

  const sessionIds = [...new Set(rows.map((r) => r.sessionId))];
  const sessionRows = await db
    .select(alertSessionColumns)
    .from(sessions)
    .innerJoin(rounds, eq(rounds.id, sessions.roundId))
    .where(inArray(sessions.id, sessionIds));
  const sessionsById = new Map(sessionRows.map((s) => [s.id, s]));
  // Loaded before claiming, so a failed read leaves the changes for the next run.
  const subscriptions = await subs();

  if (!time.hasTime()) return { processed: 0, results: [] };
  const claimed = await claimChanges(db, rows.map((r) => r.id), now);
  const plan = planChangePushes(rows.filter((r) => claimed.has(r.id)), sessionsById, subscriptions, now);
  return { processed: claimed.size, results: await sendAll(plan.pushes, send) };
}

async function runDocuments(db: Db, subs: LoadSubscriptions, now: Date, send: SendFn, time: Budget) {
  if (!time.hasTime()) return { processed: 0, results: [] };
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
    .where(isNull(fiaDocuments.notifiedAt))
    .orderBy(fiaDocuments.firstSeenAt)
    .limit(DOCUMENTS_PER_RUN);
  if (rows.length === 0) return { processed: 0, results: [] };
  const subscriptions = await subs();
  if (!time.hasTime()) return { processed: 0, results: [] };

  // Claimed by setting notifiedAt, so overlapping runs never push a document twice.
  const claimed = await db
    .update(fiaDocuments)
    .set({ notifiedAt: now })
    .where(and(inArray(fiaDocuments.url, rows.map((r) => r.url)), isNull(fiaDocuments.notifiedAt)))
    .returning({ url: fiaDocuments.url });
  const claimedUrls = new Set(claimed.map((r) => r.url));
  const pushes = planDocumentPushes(rows.filter((r) => claimedUrls.has(r.url)), subscriptions);
  return { processed: claimedUrls.size, results: await sendAll(pushes, send) };
}

/** Deletes gone subscriptions, counts failures (deleting after MAX_PUSH_FAILURES), resets the count on success. */
async function recordOutcomes(db: Db, results: { push: OutgoingPush; outcome: PushOutcome }[]): Promise<number> {
  const gone = new Set<string>();
  const failed = new Set<string>();
  const recovered = new Set<string>();
  for (const { push, outcome } of results) {
    const sub = push.subscription;
    if (outcome === "gone") gone.add(sub.id);
    else if (outcome === "failed") failed.add(sub.id);
    else if (sub.failureCount > 0) recovered.add(sub.id);
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
  const send: SendFn = options.send ?? ((push) => sendPush(push, vapid));
  const subs = lazySubscriptions(db);

  const reminders = await runReminders(db, subs, now, send, time);
  const changes = await runChanges(db, subs, now, send, time);
  const documents = await runDocuments(db, subs, now, send, time);
  const removed = await recordOutcomes(db, [...reminders.results, ...changes.results, ...documents.results]);

  // Hourly housekeeping: old reminder keys and documents are never needed again.
  if (now.getUTCMinutes() === 0) {
    await db
      .delete(remindersSent)
      .where(lt(remindersSent.startsAt, new Date(now.getTime() - REMINDER_RETENTION_DAYS * 24 * 60 * MINUTE)));
    await db
      .delete(fiaDocuments)
      .where(lt(fiaDocuments.firstSeenAt, new Date(now.getTime() - DOCUMENT_RETENTION_DAYS * 24 * 60 * MINUTE)));
  }

  const sentCount = (rs: { outcome: PushOutcome }[]) => rs.filter((r) => r.outcome === "sent").length;
  return {
    reminders: { due: reminders.due, claimed: reminders.claimed, sent: sentCount(reminders.results) },
    changes: { processed: changes.processed, pushes: changes.results.length, sent: sentCount(changes.results) },
    documents: { processed: documents.processed, pushes: documents.results.length, sent: sentCount(documents.results) },
    subscriptionsRemoved: removed,
    deadlineReached: time.reached,
  };
}
