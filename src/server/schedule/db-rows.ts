// Maps between database rows and domain objects.
import type { Round, Session } from "@/domain/types";
import type { rounds, sessions } from "@/db/schema";
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

export function roundToRow(round: Round, now: Date): typeof rounds.$inferInsert {
  return { ...round, updatedAt: now };
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
