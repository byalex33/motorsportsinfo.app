// Calendar feed: the selected Series × Session Types as an iCalendar document.
import { count, eq, max } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { scheduleChanges } from "@/db/schema";
import { SERIES, SESSION_TYPE_LABELS } from "@/domain/series";
import type { SeriesId } from "@/domain/types";
import { listCalendarSessions, scheduleTag } from "@/server/schedule";
import { buildCalendar, type SessionRevision } from "./ics";
import { followedSeries, isFollowing, type Follows } from "./selection";

export function calendarName(follows: Follows): string {
  const names = followedSeries(follows).map((s) => SERIES[s].shortName);
  return `${names.join(", ")} sessions · motorsportsinfo.app`;
}

export function calendarDescription(follows: Follows): string {
  const parts = followedSeries(follows).map(
    (s) => `${SERIES[s].shortName}: ${(follows[s] ?? []).map((t) => SESSION_TYPE_LABELS[t]).join(", ")}`,
  );
  return `Session times from motorsportsinfo.app. ${parts.join("; ")}.`;
}

/**
 * [Session id, Schedule Changes, last change as ISO] for a Series' changed Sessions. Calendar apps poll feeds
 * every few minutes, so this is cached remotely and revalidated with the Series' schedule (the sync writes a
 * Schedule Change only when it publishes), and polls don't wake the database.
 */
async function loadSeriesRevisions(series: SeriesId): Promise<[string, number, string][]> {
  "use cache: remote";
  cacheLife("days");
  cacheTag(scheduleTag(series));

  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ sessionId: scheduleChanges.sessionId, changes: count(), lastChange: max(scheduleChanges.detectedAt) })
    .from(scheduleChanges)
    .where(eq(scheduleChanges.series, series))
    .groupBy(scheduleChanges.sessionId);
  return rows.flatMap((r) => (r.lastChange ? [[r.sessionId, Number(r.changes), new Date(r.lastChange).toISOString()] as [string, number, string]] : []));
}

/** SEQUENCE / LAST-MODIFIED per Session from published Schedule Changes. Empty without a database. */
async function loadRevisions(series: SeriesId[]): Promise<Map<string, SessionRevision>> {
  const revisions = new Map<string, SessionRevision>();
  if (!getDb()) return revisions;
  try {
    for (const rows of await Promise.all(series.map((id) => loadSeriesRevisions(id)))) {
      for (const [sessionId, sequence, lastModified] of rows) {
        revisions.set(sessionId, { sequence, lastModified: new Date(lastModified) });
      }
    }
  } catch (error) {
    // The feed still works without revision numbers; clients then rely on the content itself.
    console.warn("[alerts] could not load calendar revisions", error);
  }
  return revisions;
}

export async function buildCalendarFeed(follows: Follows, now: Date = new Date()): Promise<string> {
  const entries = (await listCalendarSessions(followedSeries(follows), now)).filter(({ session }) =>
    isFollowing(follows, session.series, session.type),
  );
  const revisions = await loadRevisions(followedSeries(follows));
  return buildCalendar({
    name: calendarName(follows),
    description: calendarDescription(follows),
    entries,
    revisions,
    now,
  });
}
