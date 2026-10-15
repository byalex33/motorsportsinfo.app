// Schedule sync: per Series, decide whether a check is due, read the sources, apply Schedule
// Overrides, diff against the published state and write the plan. Called by /api/cron/sync.
import { and, eq, inArray, isNull, like } from "drizzle-orm";
import type { Db } from "@/db/client";
import { pendingSessionChanges, rounds, scheduleChanges, scheduleFlags, sessions, sourceChecks } from "@/db/schema";
import { SCHEDULE_OVERRIDES, type ScheduleOverride } from "@/data/overrides";
import type { SeriesId } from "@/domain/types";
import { decideCheckDue, type CheckDecision } from "./check-due";
import { groupSessions, roundToRow, sessionToRow } from "./db-rows";
import { diffSchedule, planChangesPublished, type PendingChange, type SchedulePlan } from "./diff";
import { isIdOfSeries, seriesIdLikePattern } from "./normalise";
import { applyOverrides } from "./overrides";
import { withCircuits } from "./select";
import { fetchSeriesSchedule } from "./sources";
import { defaultContext, errorMessage, type SourceContext } from "./sources/http";

export interface SyncResult {
  series: SeriesId;
  status: "skipped" | "synced" | "failed";
  reason?: string;
  source?: string;
  /** True when viewers' data changed and pages should be revalidated. */
  published: boolean;
  summary?: Record<string, number>;
  error?: string;
}

export interface SyncOptions {
  now?: Date;
  force?: boolean;
  ctx?: SourceContext;
  overrides?: ScheduleOverride[];
}

async function loadState(db: Db, series: SeriesId) {
  const [roundRows, sessionRows, pendingRows, flagRows, checkRows] = await Promise.all([
    db.select().from(rounds).where(eq(rounds.series, series)),
    db.select().from(sessions).where(eq(sessions.series, series)),
    db.select().from(pendingSessionChanges).where(like(pendingSessionChanges.sessionId, seriesIdLikePattern(series))),
    db
      .select({ id: scheduleFlags.id, sessionId: scheduleFlags.sessionId, message: scheduleFlags.message })
      .from(scheduleFlags)
      .where(and(eq(scheduleFlags.series, series), isNull(scheduleFlags.resolvedAt))),
    db.select().from(sourceChecks).where(eq(sourceChecks.series, series)),
  ]);
  const pending: PendingChange[] = pendingRows.map((p) => ({
    sessionId: p.sessionId,
    observedStartsAt: p.observedStartsAt.toISOString(),
    observedEndsAt: p.observedEndsAt.toISOString(),
    seenCount: p.seenCount,
  }));
  return { published: groupSessions(roundRows, sessionRows), pending, openFlags: flagRows, check: checkRows[0] ?? null };
}

async function writePlan(db: Db, series: SeriesId, plan: SchedulePlan, now: Date): Promise<void> {
  // Built as an array of drizzle queries and sent as one neon-http batch (a single transaction).
  const queries = [];
  for (const r of [...plan.roundInserts, ...plan.roundUpdates]) {
    const row = roundToRow(r, now);
    queries.push(db.insert(rounds).values(row).onConflictDoUpdate({ target: rounds.id, set: row }));
  }
  if (plan.sessionInserts.length > 0) {
    queries.push(
      db
        .insert(sessions)
        .values(plan.sessionInserts.map((s) => sessionToRow(s, now)))
        .onConflictDoNothing(),
    );
  }
  for (const s of plan.sessionUpdates) {
    const { id, ...set } = sessionToRow(s, now);
    queries.push(db.update(sessions).set(set).where(eq(sessions.id, id)));
  }
  if (plan.pendingDeletes.length > 0) {
    queries.push(db.delete(pendingSessionChanges).where(inArray(pendingSessionChanges.sessionId, plan.pendingDeletes)));
  }
  for (const p of plan.pendingUpserts) {
    const values = {
      sessionId: p.sessionId,
      observedStartsAt: new Date(p.observedStartsAt),
      observedEndsAt: new Date(p.observedEndsAt),
      seenCount: p.seenCount,
      firstSeenAt: now,
    };
    queries.push(
      db.insert(pendingSessionChanges).values(values).onConflictDoUpdate({ target: pendingSessionChanges.sessionId, set: values }),
    );
  }
  if (plan.changes.length > 0) {
    queries.push(
      db.insert(scheduleChanges).values(
        plan.changes.map((c) => ({
          sessionId: c.sessionId,
          series,
          kind: c.kind,
          previousStartsAt: new Date(c.previousStartsAt),
          newStartsAt: c.newStartsAt ? new Date(c.newStartsAt) : null,
          detectedAt: now,
        })),
      ),
    );
  }
  if (plan.flags.length > 0) {
    queries.push(
      db.insert(scheduleFlags).values(plan.flags.map((f) => ({ series, sessionId: f.sessionId, message: f.message, createdAt: now }))),
    );
  }
  if (plan.resolvedFlagIds.length > 0) {
    queries.push(db.update(scheduleFlags).set({ resolvedAt: now }).where(inArray(scheduleFlags.id, plan.resolvedFlagIds)));
  }
  if (queries.length === 0) return;
  await db.batch(queries as unknown as Parameters<Db["batch"]>[0]);
}

function summarise(plan: SchedulePlan): Record<string, number> {
  return {
    roundInserts: plan.roundInserts.length,
    roundUpdates: plan.roundUpdates.length,
    sessionInserts: plan.sessionInserts.length,
    sessionUpdates: plan.sessionUpdates.length,
    pendingUpserts: plan.pendingUpserts.length,
    pendingDeletes: plan.pendingDeletes.length,
    changes: plan.changes.length,
    flags: plan.flags.length,
    resolvedFlags: plan.resolvedFlagIds.length,
  };
}

export async function syncSeries(db: Db, series: SeriesId, options: SyncOptions = {}): Promise<SyncResult> {
  const now = options.now ?? new Date();
  const state = await loadState(db, series);

  const decision: CheckDecision | { due: true; reason: "forced" } = options.force
    ? { due: true, reason: "forced" }
    : decideCheckDue({
        now,
        lastCheckedAt: state.check?.lastCheckedAt ?? null,
        lastSucceededAt: state.check?.lastSucceededAt ?? null,
        rounds: withCircuits(state.published),
        hasPendingChanges: state.pending.length > 0,
      });
  if (!decision.due) return { series, status: "skipped", published: false };

  await db
    .insert(sourceChecks)
    .values({ series, lastCheckedAt: now })
    .onConflictDoUpdate({ target: sourceChecks.series, set: { lastCheckedAt: now } });

  let schedule;
  try {
    schedule = await fetchSeriesSchedule(series, now, options.ctx ?? defaultContext);
  } catch (error) {
    const message = errorMessage(error);
    console.error(`[sync:${series}] all sources failed: ${message}`);
    await db.update(sourceChecks).set({ lastError: message.slice(0, 2000) }).where(eq(sourceChecks.series, series));
    return { series, status: "failed", reason: decision.reason, published: false, error: message };
  }

  const overrides = (options.overrides ?? SCHEDULE_OVERRIDES).filter((o) => isIdOfSeries(o.sessionId, series));
  const applied = applyOverrides(schedule.rounds, overrides);
  const plan = diffSchedule({
    now,
    source: schedule.source,
    isFallback: schedule.isFallback,
    incoming: applied.rounds,
    overriddenSessionIds: applied.overriddenSessionIds,
    completeSeasons: schedule.completeSeasons,
    problems: schedule.problems,
    existing: {
      rounds: state.published.map((r) => r.round),
      sessions: state.published.flatMap((r) => r.sessions),
      pending: state.pending,
      openFlags: state.openFlags,
    },
  });

  for (const line of plan.log) (line.startsWith("LOUD") ? console.error : console.info)(`[sync:${series}] ${line}`);
  for (const f of plan.flags) console.error(`[sync:${series}] FLAG ${f.message}`);
  const warnings = [...schedule.warnings, ...applied.warnings];
  for (const w of warnings) console.warn(`[sync:${series}] ${w}`);

  await writePlan(db, series, plan, now);
  await db
    .update(sourceChecks)
    .set({
      lastSucceededAt: now,
      lastSource: schedule.isFallback ? `${schedule.source} (fallback)` : schedule.source,
      lastError: warnings.length > 0 ? warnings.join(" | ").slice(0, 2000) : null,
    })
    .where(eq(sourceChecks.series, series));

  return {
    series,
    status: "synced",
    reason: decision.reason,
    source: schedule.source,
    published: planChangesPublished(plan),
    summary: summarise(plan),
  };
}
