// Health of the schedule sync, for an uptime monitor (GET /api/status): open Schedule Flags and each
// Series' last source check. The sync writes these; nothing else reads them.
import { asc, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { scheduleFlags, sourceChecks } from "@/db/schema";
import { SERIES_IDS, type SeriesId } from "@/domain/types";
import { DAILY_CHECK_MS } from "@/server/schedule/check-due";

/** Every Series is checked at least daily, so a healthy one has succeeded within a day plus a little slack. */
export const MAX_SINCE_SUCCESS_MS = DAILY_CHECK_MS + 2 * 60 * 60 * 1000;
const MAX_FLAGS = 100;

export interface OpenScheduleFlag {
  id: number;
  series: SeriesId;
  sessionId: string | null;
  message: string;
  createdAt: string;
}

export interface SeriesSyncStatus {
  series: SeriesId;
  /** False when the Series has not synced successfully within MAX_SINCE_SUCCESS_MS (or ever). */
  ok: boolean;
  lastCheckedAt: string | null;
  lastSucceededAt: string | null;
  lastSource: string | null;
  /** The last failure, or the warnings of the last successful check. */
  lastError: string | null;
}

export interface SyncStatus {
  /** False when any Schedule Flag is open or any Series is not ok. */
  ok: boolean;
  now: string;
  openFlags: OpenScheduleFlag[];
  series: SeriesSyncStatus[];
}

type FlagRow = Omit<OpenScheduleFlag, "createdAt"> & { createdAt: Date };
interface CheckRow {
  series: SeriesId;
  lastCheckedAt: Date | null;
  lastSucceededAt: Date | null;
  lastSource: string | null;
  lastError: string | null;
}

/** Pure: the status for the given rows. A Series with no source_checks row has never been checked, so is not ok. */
export function summariseSyncStatus(input: { now: Date; flags: readonly FlagRow[]; checks: readonly CheckRow[] }): SyncStatus {
  const { now, flags, checks } = input;
  const bySeries = new Map(checks.map((c) => [c.series, c]));
  const series = SERIES_IDS.map((id): SeriesSyncStatus => {
    const check = bySeries.get(id);
    const succeeded = check?.lastSucceededAt ?? null;
    return {
      series: id,
      ok: succeeded !== null && now.getTime() - succeeded.getTime() <= MAX_SINCE_SUCCESS_MS,
      lastCheckedAt: check?.lastCheckedAt?.toISOString() ?? null,
      lastSucceededAt: succeeded?.toISOString() ?? null,
      lastSource: check?.lastSource ?? null,
      lastError: check?.lastError ?? null,
    };
  });
  const openFlags = flags.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }));
  return {
    ok: openFlags.length === 0 && series.every((s) => s.ok),
    now: now.toISOString(),
    openFlags,
    series,
  };
}

export async function getSyncStatus(db: Db, now: Date = new Date()): Promise<SyncStatus> {
  const [flags, checks] = await Promise.all([
    db
      .select({
        id: scheduleFlags.id,
        series: scheduleFlags.series,
        sessionId: scheduleFlags.sessionId,
        message: scheduleFlags.message,
        createdAt: scheduleFlags.createdAt,
      })
      .from(scheduleFlags)
      .where(isNull(scheduleFlags.resolvedAt))
      .orderBy(asc(scheduleFlags.createdAt))
      .limit(MAX_FLAGS),
    db.select().from(sourceChecks),
  ]);
  return summariseSyncStatus({ now, flags, checks });
}
