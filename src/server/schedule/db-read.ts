// Database read path. Cached per Series in the remote cache, shared by every instance, and invalidated by
// the sync (revalidateTag(scheduleTag(series))) whenever it publishes a change. So pages, calendar feeds and
// the crons read the schedule without waking the database, which can then scale to zero between syncs.
//
// A failed read is returned (null), not thrown: an error leaving a cached scope fails the page render even
// when the caller catches it, and the callers have a fallback. It is cached for a minute, so while the
// database is down pages don't ask it again on every render.
import { and, eq, gte, inArray, max } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { rounds, sessions } from "@/db/schema";
import type { SeriesId } from "@/domain/types";
import { groupSessions } from "./db-rows";
import { errorMessage } from "./sources/http";
import { scheduleTag } from "./tags";
import type { RoundWithSessions } from "./types";

const FAILURE_LIFE = { stale: 60, revalidate: 60, expire: 300 };

/** The published schedule, or null when the database can't be read. Empty without a database. */
export async function loadPublishedSchedule(series: SeriesId): Promise<RoundWithSessions[] | null> {
  "use cache: remote";
  cacheTag(scheduleTag(series));

  const db = getDb();
  if (!db) {
    cacheLife("days");
    return [];
  }
  try {
    // Previous season onwards: enough for "season complete" and next season's first Round.
    const fromSeason = new Date().getUTCFullYear() - 1;
    const roundRows = await db
      .select()
      .from(rounds)
      .where(and(eq(rounds.series, series), gte(rounds.season, fromSeason)));
    const ids = roundRows.map((r) => r.id);
    const sessionRows = ids.length > 0 ? await db.select().from(sessions).where(inArray(sessions.roundId, ids)) : [];
    cacheLife("days");
    return groupSessions(roundRows, sessionRows);
  } catch (error) {
    console.warn(`[schedule:${series}] database read failed: ${errorMessage(error)}`);
    cacheLife(FAILURE_LIFE);
    return null;
  }
}

function latestIso(values: (Date | string | null | undefined)[]): string | null {
  const times = values.filter((value) => value != null).map((value) => new Date(value).getTime()).filter((time) => Number.isFinite(time));
  return times.length > 0 ? new Date(Math.max(...times)).toISOString() : null;
}

/**
 * When each published Round of a Series last changed (the Round or any of its Sessions), keyed by Round
 * id. One read for the sitemap. Empty without a database or when it can't be read.
 */
export async function loadScheduleUpdatedAt(series: SeriesId): Promise<Record<string, string>> {
  "use cache: remote";
  cacheTag(scheduleTag(series));

  const db = getDb();
  if (!db) {
    cacheLife("days");
    return {};
  }
  try {
    const roundRows = await db.select({ id: rounds.id, at: rounds.updatedAt }).from(rounds).where(eq(rounds.series, series));
    const ids = roundRows.map((row) => row.id);
    const sessionRows =
      ids.length > 0
        ? await db
            .select({ roundId: sessions.roundId, at: max(sessions.updatedAt) })
            .from(sessions)
            .where(inArray(sessions.roundId, ids))
            .groupBy(sessions.roundId)
        : [];
    const sessionAt = new Map(sessionRows.map((row) => [row.roundId, row.at]));
    const out: Record<string, string> = {};
    for (const row of roundRows) {
      const at = latestIso([row.at, sessionAt.get(row.id)]);
      if (at) out[row.id] = at;
    }
    cacheLife("days");
    return out;
  } catch (error) {
    console.warn(`[schedule:${series}] could not read when its Rounds changed: ${errorMessage(error)}`);
    cacheLife(FAILURE_LIFE);
    return {};
  }
}

/**
 * When one published Round or any of its Sessions last changed (the sync only writes real changes),
 * as ISO UTC. Null without a database, when the Round is not in it, or when the database can't be read.
 */
export async function loadRoundUpdatedAt(series: SeriesId, roundId: string): Promise<string | null> {
  "use cache: remote";
  cacheTag(scheduleTag(series));

  const db = getDb();
  if (!db) {
    cacheLife("days");
    return null;
  }
  try {
    const [[round], [session]] = await Promise.all([
      db.select({ at: max(rounds.updatedAt) }).from(rounds).where(eq(rounds.id, roundId)),
      db.select({ at: max(sessions.updatedAt) }).from(sessions).where(eq(sessions.roundId, roundId)),
    ]);
    cacheLife("days");
    return latestIso([round?.at, session?.at]);
  } catch (error) {
    console.warn(`[schedule:${series}] could not read when ${roundId} changed: ${errorMessage(error)}`);
    cacheLife(FAILURE_LIFE);
    return null;
  }
}
