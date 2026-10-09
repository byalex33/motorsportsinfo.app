// F2 and F3 fallback source: the MIT-licensed sportstimes/f1 dataset (github.com/sportstimes/f1).
// UTC start times only (no end times), may lag behind the official pages, and some lat/long are 0
// (we never use them: Circuits are matched by name).
import type { SessionType } from "@/domain/types";
import type { FeederSeries } from "./fia-feeder";
import { getJson, type SourceContext } from "./http";
import type { RawRound, RawSession } from "../types";

export interface SportstimesRace {
  name: string;
  location: string;
  latitude?: number;
  longitude?: number;
  round: number;
  slug: string;
  tbc?: boolean;
  canceled?: boolean;
  sessions: Record<string, string>;
}

// Names match the official pages so Session ids agree between primary and fallback.
const SESSION_KEYS: Record<string, { name: string; type: SessionType }> = {
  practice: { name: "Practice", type: "practice" },
  qualifying: { name: "Qualifying", type: "qualifying" },
  sprint: { name: "Sprint Race", type: "sprint-race" },
  sprintRace: { name: "Sprint Race", type: "sprint-race" },
  feature: { name: "Feature Race", type: "feature-race" },
  featureRace: { name: "Feature Race", type: "feature-race" },
};

export function parseSportstimes(data: { races: SportstimesRace[] }, season: number, series: FeederSeries): RawRound[] {
  return data.races.map((race): RawRound => {
    const sessions: RawSession[] = Object.entries(race.sessions ?? {}).map(([key, startsAt]) => {
      const known = SESSION_KEYS[key];
      return {
        key: known?.name ?? key,
        name: known?.name ?? key,
        type: known?.type ?? null,
        startsAt,
        endsAt: null,
        cancelled: race.canceled === true,
      };
    });
    const days = sessions.map((s) => s.startsAt.slice(0, 10)).sort();
    const timesConfirmed = race.tbc !== true && sessions.length > 0;
    return {
      season,
      name: `Round ${race.round}`,
      circuitHints: [race.location, race.slug],
      timesConfirmed,
      sessions,
      // UTC dates, not Track Time; only used when no Session times are known.
      startDate: timesConfirmed ? null : (days[0] ?? null),
      endDate: timesConfirmed ? null : (days.at(-1) ?? null),
      sourceRef: `sportstimes ${series} ${season} round ${race.round}`,
    };
  });
}

export async function fetchSportstimesSeason(ctx: SourceContext, series: FeederSeries, year: number): Promise<RawRound[]> {
  const data = await getJson<{ races: SportstimesRace[] }>(
    ctx,
    `https://raw.githubusercontent.com/sportstimes/f1/main/_db/${series}/${year}.json`,
  );
  return parseSportstimes(data, year, series);
}
