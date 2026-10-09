// The alerts cron: sends due Session Reminders and unsent Schedule Change pushes.
// Reads the database only — never the schedule sources.
import { and, eq, gt, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { pushSubscriptions, remindersSent, rounds, scheduleChanges, sessions } from "@/db/schema";
import { REMINDER_LEAD_MINUTES } from "@/domain/series";
import { planChangePushes, type ScheduleChangeRow } from "./changes";
import { MAX_PUSH_FAILURES, PUSH_CONCURRENCY, mapWithConcurrency, sendPush, type PushOutcome, type VapidConfig } from "./push";
import { reminderKey, selectDueReminders } from "./reminders";
import type { AlertSession, AlertSubscription, OutgoingPush } from "./types";

const MINUTE = 60_000;
const MAX_LEAD_MINUTES = Math.max(...REMINDER_LEAD_MINUTES);
/** reminders_sent rows are kept this long after their Session started, then pruned. */
const REMINDER_RETENTION_DAYS = 7;
const CHANGES_PER_RUN = 200;
const INSERT_CHUNK = 500;

export interface AlertsRunResult {
  reminders: { due: number; sent: number };
  changes: { processed: number; pushes: number; sent: number };
  subscriptionsRemoved: number;
}

type SendFn = (push: OutgoingPush) => Promise<PushOutcome>;

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
      timeZone: pushSubscriptions.timeZone,
      failureCount: pushSubscriptions.failureCount,
    })
    .from(pushSubscriptions);
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

async function runReminders(db: Db, subs: AlertSubscription[], now: Date, send: SendFn) {
  const due = selectDueReminders(subs, await loadReminderSessions(db, now), now);
  if (due.length === 0) return { due: 0, results: [] };
  const fresh = await claimReminders(db, due);
  return { due: due.length, results: await sendAll(fresh, send) };
}

async function runChanges(db: Db, subs: AlertSubscription[], now: Date, send: SendFn) {
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

  const claimed = await claimChanges(db, rows.map((r) => r.id), now);
  const plan = planChangePushes(rows.filter((r) => claimed.has(r.id)), sessionsById, subs, now);
  return { processed: claimed.size, results: await sendAll(plan.pushes, send) };
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

export async function runAlerts(db: Db, vapid: VapidConfig, now: Date = new Date()): Promise<AlertsRunResult> {
  const send: SendFn = (push) => sendPush(push, vapid);
  const subs = await loadSubscriptions(db);

  const reminders = await runReminders(db, subs, now, send);
  const changes = await runChanges(db, subs, now, send);
  const removed = await recordOutcomes(db, [...reminders.results, ...changes.results]);

  // Hourly housekeeping: old reminder keys are never needed again.
  if (now.getUTCMinutes() === 0) {
    await db
      .delete(remindersSent)
      .where(lt(remindersSent.startsAt, new Date(now.getTime() - REMINDER_RETENTION_DAYS * 24 * 60 * MINUTE)));
  }

  const sentCount = (rs: { outcome: PushOutcome }[]) => rs.filter((r) => r.outcome === "sent").length;
  return {
    reminders: { due: reminders.due, sent: sentCount(reminders.results) },
    changes: { processed: changes.processed, pushes: changes.results.length, sent: sentCount(changes.results) },
    subscriptionsRemoved: removed,
  };
}
