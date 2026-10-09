// The official F2/F3 pages list late-season Rounds as "TBC" with placeholder times well after the
// sportstimes dataset has published real ones. Such Rounds take their Sessions from sportstimes,
// matched by dates; everything else (name, Circuit, ids) stays the official page's. sportstimes uses
// the official Session names, so ids still match once the official page publishes its own times.
import type { RawRound } from "../types";

const DAY_MS = 86_400_000;

function dayMs(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
}

/** True when every Session of `candidate` starts within the official Round's dates (±1 day for time zones). */
function withinDates(official: RawRound, candidate: RawRound): boolean {
  if (!official.startDate || !official.endDate || candidate.sessions.length === 0) return false;
  const from = dayMs(official.startDate) - DAY_MS;
  const to = dayMs(official.endDate) + 2 * DAY_MS;
  return candidate.sessions.every((s) => {
    const t = Date.parse(s.startsAt);
    return t >= from && t < to;
  });
}

export function fillTbcRounds(official: RawRound[], fallback: RawRound[]): { rounds: RawRound[]; filled: string[] } {
  const filled: string[] = [];
  const rounds = official.map((round) => {
    if (round.timesConfirmed) return round;
    const match = fallback.find((c) => c.season === round.season && c.timesConfirmed && withinDates(round, c));
    if (!match) return round;
    filled.push(round.sourceRef);
    return {
      ...round,
      timesConfirmed: true,
      sessions: match.sessions,
      sourceRef: `${round.sourceRef} (Session times from ${match.sourceRef})`,
    };
  });
  return { rounds, filled };
}
