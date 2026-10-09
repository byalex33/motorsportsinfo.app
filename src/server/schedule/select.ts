// Pure selection logic shared by the database and live (no database) read paths.
import { getCircuit } from "@/data/circuits";
import { FEATURED_ROUND_GRACE_MINUTES } from "@/domain/series";
import type { FeaturedRoundResult, Session } from "@/domain/types";
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
 * The Featured Round: the Round in progress, else the next upcoming one (which may be next season's
 * first Round). A Round whose every Session is cancelled is skipped. When nothing remains, the
 * season is complete.
 */
export function selectFeaturedRound(rounds: RoundWithContext[], now: Date): FeaturedRoundResult {
  const next = unfinishedRounds(rounds, now).find((r) => !allCancelled(r));
  if (next) return { kind: "round", round: next.round, circuit: next.circuit, sessions: [...next.sessions].sort(byStart) };
  const seasons = rounds.map((r) => r.round.season);
  return { kind: "season-complete", season: seasons.length > 0 ? Math.max(...seasons) : now.getUTCFullYear() };
}

/** All Sessions (including cancelled) of unfinished Rounds, ordered by startsAt. */
export function selectUpcomingSessions(rounds: RoundWithContext[], now: Date): SessionWithContext[] {
  return unfinishedRounds(rounds, now)
    .flatMap((r) => r.sessions.map((session) => ({ session, round: r.round, circuit: r.circuit })))
    .sort((a, b) => byStart(a.session, b.session));
}
