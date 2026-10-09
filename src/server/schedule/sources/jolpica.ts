// F1 fallback source: Jolpica (Ergast-compatible). UTC start times only, no end times,
// and cancelled Rounds are simply absent. Limit: 500 req/h. CC BY-NC-SA 4.0.
import type { SessionType } from "@/domain/types";
import { getJson, type SourceContext } from "./http";
import type { RawRound, RawSession } from "../types";

interface JolpicaDateTime {
  date: string;
  time?: string;
}

export interface JolpicaRace extends JolpicaDateTime {
  season: string;
  round: string;
  raceName: string;
  Circuit: {
    circuitId: string;
    circuitName: string;
    Location: { locality: string; country: string; lat: string; long: string };
  };
  FirstPractice?: JolpicaDateTime;
  SecondPractice?: JolpicaDateTime;
  ThirdPractice?: JolpicaDateTime;
  SprintQualifying?: JolpicaDateTime;
  SprintShootout?: JolpicaDateTime;
  Sprint?: JolpicaDateTime;
  Qualifying?: JolpicaDateTime;
}

export interface JolpicaResponse {
  MRData: { total: string; RaceTable: { season: string; Races: JolpicaRace[] } };
}

// Names match OpenF1's so Session ids agree between primary and fallback.
const SESSION_FIELDS: { field: keyof JolpicaRace; name: string; type: SessionType }[] = [
  { field: "FirstPractice", name: "Practice 1", type: "practice" },
  { field: "SecondPractice", name: "Practice 2", type: "practice" },
  { field: "ThirdPractice", name: "Practice 3", type: "practice" },
  { field: "SprintQualifying", name: "Sprint Qualifying", type: "sprint-qualifying" },
  { field: "SprintShootout", name: "Sprint Qualifying", type: "sprint-qualifying" },
  { field: "Sprint", name: "Sprint", type: "sprint" },
  { field: "Qualifying", name: "Qualifying", type: "qualifying" },
];

function instant(dt: JolpicaDateTime | undefined): string | null {
  if (!dt?.date || !dt.time) return null;
  return `${dt.date}T${dt.time.endsWith("Z") ? dt.time : `${dt.time}Z`}`;
}

export function parseJolpica(data: JolpicaResponse): RawRound[] {
  return data.MRData.RaceTable.Races.map((race): RawRound => {
    const sessions: RawSession[] = [];
    let missingTime = false;
    for (const { field, name, type } of [
      ...SESSION_FIELDS,
      { field: "date" as const, name: "Race", type: "race" as const },
    ]) {
      const dt = field === "date" ? { date: race.date, time: race.time } : (race[field] as JolpicaDateTime | undefined);
      if (!dt) continue;
      const startsAt = instant(dt);
      if (!startsAt) {
        missingTime = true;
        continue;
      }
      sessions.push({ key: name, name, type, startsAt, endsAt: null, cancelled: false });
    }
    const dates = [race.FirstPractice?.date, race.date].filter(Boolean) as string[];
    const timesConfirmed = !missingTime && sessions.length > 0;
    return {
      season: Number(race.season),
      name: race.raceName,
      circuitHints: [race.Circuit.circuitId, race.Circuit.circuitName, race.Circuit.Location.locality],
      timesConfirmed,
      sessions,
      // Jolpica dates are UTC dates, not Track Time; only used when no Session times are known.
      startDate: timesConfirmed ? null : (dates[0] ?? null),
      endDate: timesConfirmed ? null : (race.date ?? null),
      sourceRef: `Jolpica ${race.season} round ${race.round}`,
    };
  });
}

export async function fetchJolpicaSeason(ctx: SourceContext, year: number): Promise<RawRound[]> {
  const data = await getJson<JolpicaResponse>(ctx, `https://api.jolpi.ca/ergast/f1/${year}/races/?limit=100`);
  return parseJolpica(data);
}
