// Maps between database rows and domain objects.
import { getCircuit } from "@/data/circuits";
import type { Round, Session } from "@/domain/types";
import type { pendingSessionChanges, rounds, sessions } from "@/db/schema";
import { everySessionCancelled } from "@/lib/round-status";
import { assignRoundPageSlugs, type RoundPageSource } from "@/lib/seo/round-page";
import type { PendingChange } from "./diff";
import type { RoundWithSessions } from "./types";

type RoundRow = typeof rounds.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;
type PendingRow = typeof pendingSessionChanges.$inferSelect;

/**
 * pending_session_changes has no status column, so a pending cancellation is stored with this seen_count.
 * A pending time change is always stored with 1: the second sighting publishes it and deletes the row.
 */
export const PENDING_CANCELLATION_SEEN_COUNT = -1;

const iso = (d: Date | string) => new Date(d).toISOString();

export function roundFromRow(row: RoundRow): Round {
  return {
    id: row.id,
    series: row.series,
    season: row.season,
    slug: row.slug,
    name: row.name,
    circuitId: row.circuitId,
    startDate: String(row.startDate).slice(0, 10),
    endDate: String(row.endDate).slice(0, 10),
    sessionTimesConfirmed: row.sessionTimesConfirmed,
    ...(row.pageSlug ? { pageSlug: row.pageSlug } : {}),
  };
}

export function sessionFromRow(row: SessionRow): Session {
  return {
    id: row.id,
    roundId: row.roundId,
    series: row.series,
    type: row.type,
    name: row.name,
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    endIsEstimated: row.endIsEstimated,
    status: row.status,
  };
}

/** The Round's columns, without page_slug: that is only ever set by pageSlugsToStore, never overwritten. */
export function roundToRow(round: Round, now: Date): typeof rounds.$inferInsert {
  return {
    id: round.id,
    series: round.series,
    season: round.season,
    slug: round.slug,
    name: round.name,
    circuitId: round.circuitId,
    startDate: round.startDate,
    endDate: round.endDate,
    sessionTimesConfirmed: round.sessionTimesConfirmed,
    updatedAt: now,
  };
}

/**
 * The page slugs to store, keyed by Round id: one for each Round that has none yet, once `written` (the
 * Rounds the sync is inserting or updating) is published over `published`. Slugs are assigned over the
 * whole published schedule, stored slugs included, so the collision suffixes match what pages derive. A
 * Round whose Circuit is unknown is not shown, so it gets none until its Circuit is known.
 *
 * `sessions` are every Session once the sync's write is done. A Round whose every Session is cancelled
 * gets no stored slug: pages keep it off the plain slug when the Round that is run needs it (see
 * assignRoundPageSlugs), and a stored slug would hold that place for good.
 */
export function pageSlugsToStore(
  published: readonly Round[],
  written: readonly Round[],
  sessions: readonly Pick<Session, "roundId" | "status">[] = [],
): Map<string, string> {
  const after = new Map(published.map((round) => [round.id, round]));
  // A source's Round carries no page slug: the published one, if any, stays.
  for (const round of written) after.set(round.id, { ...round, pageSlug: after.get(round.id)?.pageSlug });
  const byRound = new Map<string, Pick<Session, "status">[]>();
  for (const session of sessions) byRound.set(session.roundId, [...(byRound.get(session.roundId) ?? []), session]);
  const sources: RoundPageSource[] = [];
  for (const round of after.values()) {
    const circuit = getCircuit(round.circuitId);
    if (circuit) sources.push({ round, circuit, sessions: byRound.get(round.id) });
  }
  const slugs = assignRoundPageSlugs(sources);
  const out = new Map<string, string>();
  for (const { round, sessions: own } of sources) {
    const slug = slugs.get(round.id);
    if (!round.pageSlug && slug && !everySessionCancelled(own)) out.set(round.id, slug);
  }
  return out;
}

export function sessionToRow(session: Session, now: Date): typeof sessions.$inferInsert {
  return { ...session, startsAt: new Date(session.startsAt), endsAt: new Date(session.endsAt), updatedAt: now };
}

export function pendingFromRow(row: PendingRow): PendingChange {
  const pending: PendingChange = {
    sessionId: row.sessionId,
    observedStartsAt: iso(row.observedStartsAt),
    observedEndsAt: iso(row.observedEndsAt),
    seenCount: row.seenCount,
  };
  return row.seenCount === PENDING_CANCELLATION_SEEN_COUNT ? { ...pending, seenCount: 1, cancelled: true } : pending;
}

export function pendingToRow(pending: PendingChange, now: Date): typeof pendingSessionChanges.$inferInsert {
  return {
    sessionId: pending.sessionId,
    observedStartsAt: new Date(pending.observedStartsAt),
    observedEndsAt: new Date(pending.observedEndsAt),
    seenCount: pending.cancelled ? PENDING_CANCELLATION_SEEN_COUNT : pending.seenCount,
    firstSeenAt: now,
  };
}

export function groupSessions(roundRows: RoundRow[], sessionRows: SessionRow[]): RoundWithSessions[] {
  const byRound = new Map<string, Session[]>();
  for (const row of sessionRows) {
    const s = sessionFromRow(row);
    byRound.set(s.roundId, [...(byRound.get(s.roundId) ?? []), s]);
  }
  return roundRows.map((row) => ({
    round: roundFromRow(row),
    sessions: (byRound.get(row.id) ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  }));
}
