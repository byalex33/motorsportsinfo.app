// The alerts cron: sends due Session Reminders, unsent Schedule Change pushes and Document Alerts, and once a
// day the owner's sync alert. Reads the database only — never the schedule sources or fia.com.
import { and, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { fiaDocuments, pushSubscriptions, remindersSent, rounds, scheduleChanges, sessions } from "@/db/schema";
import { REMINDER_LEAD_MINUTES } from "@/domain/series";
import { getSyncStatus } from "@/server/status";
import { planChangePushes, type ScheduleChangeRow } from "./changes";
import { planDocumentPushes, type DocumentAlertRow } from "./document-alerts";
import { OWNER_ALERT_TTL_SECONDS, getOwnerPushEndpoint, isOwnerAlertDue, ownerAlertPayload } from "./owner";
import { MAX_PUSH_FAILURES, PUSH_CONCURRENCY, mapWithConcurrency, sendPush, type PushOutcome, type VapidConfig } from "./push";
import { reminderKey, selectDueReminders, type DueReminder } from "./reminders";
import type { AlertSession, AlertSubscription, OutgoingPush } from "./types";
import type { AlertsWork } from "./wake";

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

async function sendAll<P extends OutgoingPush>(pushes: readonly P[], send: SendFn): Promise<{ push: P; outcome: PushOutcome }[]> {
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

/**
 * Deletes the claims of reminders whose send did not go through ("error" or "failed"), so the next run sends
 * them again. This never loops: selectDueReminders only offers a reminder inside its catch-up window
 * (REMINDER_CATCH_UP_MINUTES after start − lead, and before the Session starts), so at most that many runs retry it.
 * A failed release only costs the retry, so it is logged and the run goes on.
 */
async function releaseReminders(
  db: Db,
  results: readonly { push: DueReminder; outcome: PushOutcome }[],
): Promise<void> {
  const retry = results.filter((r) => r.outcome === "error" || r.outcome === "failed").map((r) => r.push);
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
 * A claimed reminder whose send did not go through is released again (releaseReminders), so it is retried too.
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
    const sent = await sendAll(fresh, send);
    await releaseReminders(db, sent);
    results.push(...sent);
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

/** At 07:00 UTC, one push to the owner's own subscription if the schedule sync is unhealthy. */
async function runOwnerAlert(db: Db, endpoint: string | null, now: Date, send: SendFn, time: Budget) {
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
  return sendAll([{ subscription, payload, ttlSeconds: OWNER_ALERT_TTL_SECONDS }], send);
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
      `[alerts] every push this run went wrong (${errors} error, ${wrong - errors} failed): not counting them against subscriptions`,
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
  const send: SendFn = options.send ?? ((push) => sendPush(push, vapid));
  const subs = lazySubscriptions(db);
  const work: AlertsWork = { reminders: true, pushes: true, daily: isOwnerAlertDue(now), ...options.work };
  const none = { due: 0, claimed: 0, processed: 0, results: [] };

  const reminders = work.reminders ? await runReminders(db, subs, now, send, time) : none;
  const changes = work.pushes ? await runChanges(db, subs, now, send, time) : none;
  const documents = work.pushes ? await runDocuments(db, subs, now, send, time) : none;
  const ownerEndpoint = options.ownerEndpoint === undefined ? getOwnerPushEndpoint() : options.ownerEndpoint;
  const owner = await runOwnerAlert(db, ownerEndpoint, now, send, time);
  const removed = await recordOutcomes(db, [...reminders.results, ...changes.results, ...documents.results, ...owner]);

  // Daily housekeeping, in the 07:00 UTC run: old reminder keys and documents are never needed again.
  if (work.daily) {
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
    ownerAlert: owner[0]?.outcome ?? null,
    deadlineReached: time.reached,
  };
}
