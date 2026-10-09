// Helpers for schedule tests. Fixtures are trimmed real responses saved from each source.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getCircuit } from "@/data/circuits";
import type { Round, SeriesId, Session, SessionType } from "@/domain/types";
import type { RoundWithContext } from "./types";

export function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8");
}

export function fixtureJson<T>(name: string): T {
  return JSON.parse(fixture(name)) as T;
}

export function makeSession(roundId: string, slug: string, startsAt: string, opts: Partial<Session> = {}): Session {
  const series = roundId.split("-")[0] as SeriesId;
  const start = new Date(startsAt);
  return {
    id: `${roundId}:${slug}`,
    roundId,
    series,
    type: "practice" as SessionType,
    name: slug,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 60 * 60000).toISOString(),
    endIsEstimated: false,
    status: "scheduled",
    ...opts,
  };
}

export function makeRound(id: string, circuitId: string, startDate: string, endDate: string, opts: Partial<Round> = {}): Round {
  const [series, season, ...slug] = id.split("-");
  return {
    id,
    series: series as SeriesId,
    season: Number(season),
    slug: slug.join("-"),
    name: id,
    circuitId,
    startDate,
    endDate,
    sessionTimesConfirmed: true,
    ...opts,
  };
}

export function withContext(round: Round, sessions: Session[]): RoundWithContext {
  const circuit = getCircuit(round.circuitId);
  if (!circuit) throw new Error(`unknown circuit ${round.circuitId}`);
  return { round, sessions, circuit };
}
