// Pure selection logic shared by the database and live (no database) read paths.
import { getCircuit } from "@/data/circuits";
import { FEATURED_ROUND_GRACE_MINUTES, isNumberedRound } from "@/domain/series";
import type { Circuit, FeaturedRoundResult, Round, Session } from "@/domain/types";
import type { SessionWithContext } from "./index";
import { addDays, MINUTE, trackMidnight } from "./time";
import type { RoundWithContext, RoundWithSessions } from "./types";

const byStart = (a: Session, b: Session) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id);

/** Attaches Circuits; Rounds whose Circuit is no longer in the list are dropped (and logged). */
export function withCircuits(rounds: RoundWithSessions[]): RoundWithContext[] {
  return rounds.flatMap((r) => {
    const circuit = getCircuit(r.round.circuitId);
    if (!circuit) {
      console.error(`[schedule] Round ${r.round.id} has unknown Circuit "${r.round.circuitId}"; not shown`);
      return [];
    }
    return [{ ...r, sessions: [...r.sessions].sort(byStart), circuit }];
  });
}

/** 00:00 Track Time on the Round's first day. */
export function roundOpensAt(r: RoundWithContext): Date {
  return trackMidnight(r.round.startDate, r.circuit.timeZone);
}

/** When the Round's final Session ends (or the end of its last day when no Session times are known). */
export function roundEndsAt(r: RoundWithContext): Date {
  if (r.sessions.length === 0) return trackMidnight(addDays(r.round.endDate, 1), r.circuit.timeZone);
  return new Date(Math.max(...r.sessions.map((s) => new Date(s.endsAt).getTime())));
}

/** A Round stays featured (and "not finished") until this instant. */
export function featuredUntil(r: RoundWithContext): Date {
  return new Date(roundEndsAt(r).getTime() + FEATURED_ROUND_GRACE_MINUTES * MINUTE);
}

function firstInstant(r: RoundWithContext): number {
  const starts = r.sessions.map((s) => new Date(s.startsAt).getTime());
  return starts.length > 0 ? Math.min(...starts) : roundOpensAt(r).getTime();
}

const allCancelled = (r: RoundWithContext) => r.sessions.length > 0 && r.sessions.every((s) => s.status === "cancelled");

/** Rounds that haven't finished yet (featured-grace rule), in calendar order. */
export function unfinishedRounds(rounds: RoundWithContext[], now: Date): RoundWithContext[] {
  return rounds
    .filter((r) => featuredUntil(r).getTime() > now.getTime())
    .sort((a, b) => firstInstant(a) - firstInstant(b));
}

/**
 * The Round's place in its season: its Series' Rounds that season in calendar order, not counting Rounds
 * whose every Session is cancelled (the Series renumber around those) or that the Series doesn't number
 * (null for those). F2, F3 and F1 Academy Rounds are named by their official number ("Round 13"), which
 * wins over the count.
 */
function roundNumber(target: RoundWithContext, rounds: RoundWithContext[]): number | null {
  const official = /^Round (\d+)$/.exec(target.round.name);
  if (official) return Number(official[1]);
  if (!isNumberedRound(target.round.series, target.round.name)) return null;
  const season = rounds
    .filter(
      (r) =>
        r.round.series === target.round.series &&
        r.round.season === target.round.season &&
        !allCancelled(r) &&
        isNumberedRound(r.round.series, r.round.name),
    )
    .sort((a, b) => firstInstant(a) - firstInstant(b));
  return season.findIndex((r) => r.round.id === target.round.id) + 1;
}

/**
 * The Featured Round: the Round in progress, else the next upcoming one (which may be next season's
 * first Round). A Round whose every Session is cancelled is skipped. When nothing remains, the
 * season is complete.
 */
export function selectFeaturedRound(rounds: RoundWithContext[], now: Date): FeaturedRoundResult {
  const next = unfinishedRounds(rounds, now).find((r) => !allCancelled(r));
  if (next) {
    return {
      kind: "round",
      round: next.round,
      roundNumber: roundNumber(next, rounds),
      circuit: next.circuit,
      sessions: [...next.sessions].sort(byStart),
    };
  }
  const seasons = rounds.map((r) => r.round.season);
  return { kind: "season-complete", season: seasons.length > 0 ? Math.max(...seasons) : now.getUTCFullYear() };
}

/** A Round on the full calendar. */
export interface UpcomingRound {
  round: Round;
  /** The Round's place in its season, e.g. 18 for Round 18; null for a Round the Series doesn't number. */
  roundNumber: number | null;
  circuit: Circuit;
  /** Ordered by startsAt. Cancelled Sessions are included. */
  sessions: Session[];
}

/** Every Round that hasn't finished (featured-grace rule), in calendar order. */
export function selectUpcomingRounds(rounds: RoundWithContext[], now: Date): UpcomingRound[] {
  return unfinishedRounds(rounds, now).map((r) => ({
    round: r.round,
    roundNumber: roundNumber(r, rounds),
    circuit: r.circuit,
    sessions: [...r.sessions].sort(byStart),
  }));
}

/** All Sessions (including cancelled) of unfinished Rounds, ordered by startsAt. */
export function selectUpcomingSessions(rounds: RoundWithContext[], now: Date): SessionWithContext[] {
  return sessionsOf(unfinishedRounds(rounds, now));
}

/** How long a finished Round stays in calendar feeds, so subscribers' calendars keep its events. */
export const CALENDAR_HISTORY_DAYS = 60;

/** Sessions of Rounds that finished within CALENDAR_HISTORY_DAYS or haven't finished, ordered by startsAt. */
export function selectCalendarSessions(rounds: RoundWithContext[], now: Date): SessionWithContext[] {
  const since = new Date(now.getTime() - CALENDAR_HISTORY_DAYS * 86_400_000);
  return sessionsOf(unfinishedRounds(rounds, since));
}

function sessionsOf(rounds: RoundWithContext[]): SessionWithContext[] {
  return rounds
    .flatMap((r) => r.sessions.map((session) => ({ session, round: r.round, circuit: r.circuit })))
    .sort((a, b) => byStart(a.session, b.session));
}
