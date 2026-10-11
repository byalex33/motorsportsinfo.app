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

/**
 * When the published Round or any of its Sessions last changed (the sync only writes real changes),
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
