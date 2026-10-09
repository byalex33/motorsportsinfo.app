// Calendar feed: the selected Series × Session Types as an iCalendar document.
import { count, inArray, max } from "drizzle-orm";
import { getDb } from "@/db/client";
import { scheduleChanges } from "@/db/schema";
import { SERIES, SESSION_TYPE_LABELS } from "@/domain/series";
import { listCalendarSessions } from "@/server/schedule";
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

/** SEQUENCE / LAST-MODIFIED per Session from published Schedule Changes. Empty without a database. */
async function loadRevisions(sessionIds: string[]): Promise<Map<string, SessionRevision>> {
  const db = getDb();
  const revisions = new Map<string, SessionRevision>();
  if (!db || sessionIds.length === 0) return revisions;
  try {
    const rows = await db
      .select({
        sessionId: scheduleChanges.sessionId,
        changes: count(),
        lastChange: max(scheduleChanges.detectedAt),
      })
      .from(scheduleChanges)
      .where(inArray(scheduleChanges.sessionId, sessionIds))
      .groupBy(scheduleChanges.sessionId);
    for (const r of rows) {
      if (r.lastChange) revisions.set(r.sessionId, { sequence: Number(r.changes), lastModified: new Date(r.lastChange) });
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
  const revisions = await loadRevisions(entries.map((e) => e.session.id));
  return buildCalendar({
    name: calendarName(follows),
    description: calendarDescription(follows),
    entries,
    revisions,
    now,
  });
}
