// NASCAR Cup Series: NASCAR's own public schedule feed (cf.nascar.com/cacher/<year>/race_list_basic.json),
// the one nascar.com's schedule pages read. `series_1` is the Cup Series. Each race lists its weekend as
// `schedule` entries with UTC start times and a `run_type`: 1 practice, 2 qualifying, 3 race, 0 off-track
// (garage hours, driver meetings), which is dropped. No end times, so every Session end is estimated.
// - The Daytona Duels are listed as their own races ("Qualifying Race 1"); they decide the Daytona 500 grid,
//   so they join the next race at the same track as qualifying Sessions.
// - Race names carry sponsors; only "presented by …" / "powered by …" tails are removed.
// - Circuits are matched by `track_name` against the Circuit aliases.
import type { SessionType } from "@/domain/types";
import { getJson, type SourceContext } from "./http";
import type { RawRound, RawSession } from "../types";

export interface NascarScheduleItem {
  event_name: string;
  notes?: string;
  /** UTC without a zone, e.g. "2026-03-01T20:30:00". */
  start_time_utc: string;
  run_type: number;
}

export interface NascarRace {
  race_id: number;
  series_id: number;
  race_season: number;
  race_name: string;
  track_id: number;
  track_name: string;
  /** Local (Eastern) date and time of the race, e.g. "2026-03-01T15:30:00". */
  date_scheduled: string;
  schedule?: NascarScheduleItem[] | null;
}

export type NascarSeason = Partial<Record<`series_${number}`, NascarRace[]>>;

const RUN_TYPES: Record<number, SessionType> = { 1: "practice", 2: "qualifying", 3: "race" };

/** Days before a race in which a qualifying-only race at the same track (the Duels) joins it. */
const DUEL_WINDOW_DAYS = 7;

/** "Pennzoil 400 presented by Jiffy Lube" → "Pennzoil 400"; "Quaker State 400 Available at Walmart" → "Quaker State 400". */
export function cleanNascarRaceName(name: string): string {
  return name
    .replace(/\s+(presented|powered)\s+by\s+.*$/i, "")
    .replace(/\s+available at\s+.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Qualifying (Impound)" → "Qualifying"; "Qualifying Race 1" → "Duel 1". */
function sessionName(item: NascarScheduleItem): string {
  const name = item.event_name.replace(/\s*\(impound\)\s*/i, " ").replace(/\s+/g, " ").trim();
  const duel = /^qualifying race (\d+)$/i.exec(name);
  return duel ? `Duel ${duel[1]}` : name;
}

function utc(value: string): string {
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
}

function onTrack(race: NascarRace): RawSession[] {
  return (race.schedule ?? [])
    .filter((item) => RUN_TYPES[item.run_type])
    .map((item) => {
      const name = sessionName(item);
      return { key: name, name, type: RUN_TYPES[item.run_type], startsAt: utc(item.start_time_utc), endsAt: null, cancelled: false };
    });
}

/** A race that is only qualifying (the Duels), never a Round of its own. */
function isQualifyingOnly(sessions: RawSession[]): boolean {
  return sessions.length > 0 && sessions.every((s) => s.type === "qualifying") && sessions.some((s) => /^duel\b/i.test(s.name));
}

export function parseNascarSeason(data: NascarSeason, season: number): { rounds: RawRound[]; warnings: string[] } {
  const warnings: string[] = [];
  const races = [...(data.series_1 ?? [])].sort((a, b) => a.date_scheduled.localeCompare(b.date_scheduled));
  const entries = races.map((race) => ({ race, sessions: onTrack(race) }));

  // Fold the Duels into the next race at the same track.
  const duels = entries.filter((e) => isQualifyingOnly(e.sessions));
  const rounds = entries.filter((e) => !duels.includes(e));
  for (const duel of duels) {
    const at = Date.parse(utc(duel.race.date_scheduled));
    const host = rounds.find((e) => {
      const days = (Date.parse(utc(e.race.date_scheduled)) - at) / 86_400_000;
      return e.race.track_id === duel.race.track_id && days >= 0 && days <= DUEL_WINDOW_DAYS;
    });
    if (host) host.sessions.push(...duel.sessions);
    else warnings.push(`NASCAR ${season} race ${duel.race.race_id} "${duel.race.race_name}" has only qualifying and no race to join; skipped`);
  }

  return {
    warnings,
    rounds: rounds.map(({ race, sessions }): RawRound => {
      const timesConfirmed = sessions.some((s) => s.type === "race");
      const day = race.date_scheduled.slice(0, 10);
      return {
        season,
        name: cleanNascarRaceName(race.race_name),
        circuitHints: [race.track_name],
        timesConfirmed,
        sessions: timesConfirmed ? sessions : [],
        startDate: timesConfirmed ? null : day,
        endDate: timesConfirmed ? null : day,
        sourceRef: `nascar ${season} race ${race.race_id}`,
      };
    }),
  };
}

export function nascarUrl(year: number): string {
  return `https://cf.nascar.com/cacher/${year}/race_list_basic.json`;
}

export async function fetchNascarSeason(ctx: SourceContext, year: number): Promise<{ rounds: RawRound[]; warnings: string[] }> {
  return parseNascarSeason(await getJson<NascarSeason>(ctx, nascarUrl(year)), year);
}
