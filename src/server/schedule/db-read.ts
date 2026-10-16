// Database read path. Cached per Series with Cache Components and invalidated by the sync
// (revalidateTag(scheduleTag(series))) whenever it publishes a change.
import { and, eq, gte, inArray, max } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { rounds, sessions } from "@/db/schema";
import type { SeriesId } from "@/domain/types";
import { groupSessions } from "./db-rows";
import { scheduleTag } from "./tags";
import type { RoundWithSessions } from "./types";

export async function loadPublishedSchedule(series: SeriesId): Promise<RoundWithSessions[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(scheduleTag(series));

  const db = getDb();
  if (!db) return [];
  // Previous season onwards: enough for "season complete" and next season's first Round.
  const fromSeason = new Date().getUTCFullYear() - 1;
  const roundRows = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.series, series), gte(rounds.season, fromSeason)));
  const ids = roundRows.map((r) => r.id);
  const sessionRows = ids.length > 0 ? await db.select().from(sessions).where(inArray(sessions.roundId, ids)) : [];
  return groupSessions(roundRows, sessionRows);
}

function latestIso(values: (Date | string | null | undefined)[]): string | null {
  const times = values.filter((value) => value != null).map((value) => new Date(value).getTime()).filter((time) => Number.isFinite(time));
  return times.length > 0 ? new Date(Math.max(...times)).toISOString() : null;
}

/**
 * When each published Round of a Series last changed (the Round or any of its Sessions), keyed by Round
 * id. One read for the sitemap. Empty without a database.
 */
export async function loadScheduleUpdatedAt(series: SeriesId): Promise<Record<string, string>> {
  "use cache";
  cacheLife("hours");
  cacheTag(scheduleTag(series));

  const db = getDb();
  if (!db) return {};
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
  return out;
}

/**
 * When one published Round or any of its Sessions last changed (the sync only writes real changes),
 * as ISO UTC. Null without a database or when the Round is not in it.
 */
export async function loadRoundUpdatedAt(series: SeriesId, roundId: string): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(scheduleTag(series));

  const db = getDb();
  if (!db) return null;
  const [[round], [session]] = await Promise.all([
    db.select({ at: max(rounds.updatedAt) }).from(rounds).where(eq(rounds.id, roundId)),
    db.select({ at: max(sessions.updatedAt) }).from(sessions).where(eq(sessions.roundId, roundId)),
  ]);
  const times = [round?.at, session?.at].filter((t) => t != null).map((t) => new Date(t).getTime());
  return times.length > 0 ? new Date(Math.max(...times)).toISOString() : null;
}
