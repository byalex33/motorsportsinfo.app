// Database read path. Cached per Series with Cache Components and invalidated by the sync
// (revalidateTag(scheduleTag(series))) whenever it publishes a change.
import { and, eq, gte, inArray } from "drizzle-orm";
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
