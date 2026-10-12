// Internal types shared by the schedule sources, sync and reads. Not part of the UI contract.
import type { Circuit, Round, SeriesId, Session, SessionType } from "@/domain/types";

/** A Session as a source describes it, before normalisation. */
export interface RawSession {
  /** Text the Session id slug is made from, e.g. "Practice 1" → "practice-1". */
  key: string;
  /** Display name as the Series uses it. */
  name: string;
  /** null when the source's Session could not be mapped to a Session Type. */
  type: SessionType | null;
  /** ISO 8601 UTC. */
  startsAt: string;
  /** ISO 8601 UTC, or null when the source gives no end time. */
  endsAt: string | null;
  /** True when the source's end time is itself an estimate (a rally day's end, from its last stage). */
  endIsEstimated?: boolean;
  /** True only when the source explicitly says the Session is cancelled. */
  cancelled: boolean;
}

/** A Round as a source describes it, before Circuit matching and normalisation. */
export interface RawRound {
  season: number;
  name: string;
  /** Names that identify the Circuit: circuit short names, localities, page slugs. Never a Grand Prix name. */
  circuitHints: string[];
  /**
   * Set when the source resolved the Circuit itself (MotoGP, by coordinates): the Circuit id, or null when
   * it found none. The hints are then only shown in the problem message and never name-matched.
   */
  circuitId?: string | null;
  /** False when the Round is listed but its Session times are not published ("Times TBC"). */
  timesConfirmed: boolean;
  sessions: RawSession[];
  /** Track Time dates from the source, used when there are no Session times. */
  startDate?: string | null;
  endDate?: string | null;
  /** Where this Round came from, for flags and logs. */
  sourceRef: string;
}

export interface RoundWithSessions {
  round: Round;
  sessions: Session[];
}

/** One source's view of a Series, normalised. */
export interface SourceSchedule {
  series: SeriesId;
  /** e.g. "openf1", "jolpica", "fiaformula2", "sportstimes", "fiawec". */
  source: string;
  isFallback: boolean;
  rounds: RoundWithSessions[];
  /**
   * Seasons the source listed completely. Disappearance checks only run for these,
   * so a failed page or an unpublished next season never looks like vanished Sessions.
   */
  completeSeasons: number[];
  /** Problems a human must look at (unknown Circuit, unmapped Session). Recorded as schedule flags. */
  problems: string[];
  /** Transient issues (a page failed to load). Logged and kept in lastError, not flagged. */
  warnings: string[];
}

export interface RoundWithContext extends RoundWithSessions {
  circuit: Circuit;
}
