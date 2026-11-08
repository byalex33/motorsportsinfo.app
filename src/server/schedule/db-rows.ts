// Maps between database rows and domain objects.
import { getCircuit } from "@/data/circuits";
import type { Round, Session } from "@/domain/types";
import type { rounds, sessions } from "@/db/schema";
import { assignRoundPageSlugs, type RoundPageSource } from "@/lib/seo/round-page";
import type { RoundWithSessions } from "./types";

type RoundRow = typeof rounds.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;

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
 */
export function pageSlugsToStore(published: readonly Round[], written: readonly Round[]): Map<string, string> {
  const after = new Map(published.map((round) => [round.id, round]));
  // A source's Round carries no page slug: the published one, if any, stays.
  for (const round of written) after.set(round.id, { ...round, pageSlug: after.get(round.id)?.pageSlug });
  const sources: RoundPageSource[] = [];
  for (const round of after.values()) {
    const circuit = getCircuit(round.circuitId);
    if (circuit) sources.push({ round, circuit });
  }
  const slugs = assignRoundPageSlugs(sources);
  const out = new Map<string, string>();
  for (const { round } of sources) {
    const slug = slugs.get(round.id);
    if (!round.pageSlug && slug) out.set(round.id, slug);
  }
  return out;
}

export function sessionToRow(session: Session, now: Date): typeof sessions.$inferInsert {
  return { ...session, startsAt: new Date(session.startsAt), endsAt: new Date(session.endsAt), updatedAt: now };
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
