// The MIT-licensed sportstimes/f1 dataset (github.com/sportstimes/f1): the F2 and F3 fallback, and the only
// source for Formula E, IndyCar and MotoGP. UTC start times only (no end times), and it may lag behind the
// official sites. Each Series' file has its own quirks:
// - F2, F3, FE: `location` names the Circuit (lat/lon are city centres or 0, so unused for matching).
// - IndyCar: no `location` and lat/lon 0, so the Round name and slug are matched against Circuit aliases.
// - MotoGP: `name`/`location` are countries and `track` is often wrong (shifted between Rounds), so the
//   Circuit is the nearest known one to the coordinates; a disagreeing `track` is only a warning.
import { circuitCountry, distanceKm, matchCircuit, nearestCircuit } from "@/data/circuits";
import type { Circuit, SessionType } from "@/domain/types";
import { getJson, type SourceContext } from "./http";
import { slugify } from "../normalise";
import type { RawRound, RawSession } from "../types";

export type SportstimesSeries = "f2" | "f3" | "fe" | "indycar" | "motogp";

export interface SportstimesRace {
  name: string;
  location?: string;
  /** MotoGP only; unreliable. */
  track?: string;
  /** Numbers, or strings in the MotoGP file. 0 where unknown. */
  latitude?: number | string;
  longitude?: number | string;
  round: number;
  slug: string;
  tbc?: boolean;
  canceled?: boolean;
  sessions: Record<string, string>;
}

export interface SportstimesSeason {
  rounds: RawRound[];
  warnings: string[];
}

interface SessionDef {
  name: string;
  type: SessionType;
}

// F2/F3 names match the official pages so Session ids agree between primary and fallback.
const FEEDER_SESSIONS: Record<string, SessionDef> = {
  practice: { name: "Practice", type: "practice" },
  qualifying: { name: "Qualifying", type: "qualifying" },
  sprint: { name: "Sprint Race", type: "sprint-race" },
  sprintRace: { name: "Sprint Race", type: "sprint-race" },
  feature: { name: "Feature Race", type: "feature-race" },
  featureRace: { name: "Feature Race", type: "feature-race" },
};

/** Maps a sportstimes Session key to the Series' Session name and Session Type, or null if unknown. */
export function sportstimesSession(series: SportstimesSeries, key: string): SessionDef | null {
  let m: RegExpExecArray | null;
  switch (series) {
    case "f2":
    case "f3":
      return FEEDER_SESSIONS[key] ?? null;
    case "fe":
      if ((m = /^practice(\d+)$/.exec(key))) return { name: `Free Practice ${m[1]}`, type: "practice" };
      if (key === "qualifying") return { name: "Qualifying", type: "qualifying" };
      if (key === "race") return { name: "Race", type: "race" };
      return null;
    case "indycar":
      if ((m = /^practice(\d+)$/.exec(key))) return { name: `Practice ${m[1]}`, type: "practice" };
      if (key === "FinalPractice") return { name: "Final Practice", type: "practice" };
      if (key === "warmup") return { name: "Warm-up", type: "practice" };
      if (key === "qualifying") return { name: "Qualifying", type: "qualifying" };
      if (key === "race") return { name: "Race", type: "race" };
      return null;
    case "motogp":
      if ((m = /^fp(\d+)$/.exec(key))) return { name: `Free Practice ${m[1]}`, type: "practice" };
      if (key === "practice") return { name: "Practice", type: "practice" };
      if ((m = /^qualifying(\d+)$/.exec(key))) return { name: `Q${m[1]}`, type: "qualifying" };
      if (key === "sprint") return { name: "Sprint", type: "sprint" };
      if (key === "warmup") return { name: "Warm Up", type: "practice" };
      if (key === "race") return { name: "Race", type: "race" };
      return null;
  }
}

/** Unknown keys that are clearly practice running. Anything else stays unmapped and is flagged. */
const PRACTICE_LIKE = /practice|^fp\d*$|warm.?up|shakedown/i;

/**
 * IndyCar Round names are mostly sponsor names. Strip only what is safe:
 * "110th Running of the Indianapolis 500" → "Indianapolis 500"; "<sponsor> Grand Prix of|at <place>" →
 * "Grand Prix of|at <place>". Anything else is kept as published.
 */
export function cleanIndyCarRoundName(name: string): string {
  if (/\b(indianapolis|indy) 500\b/i.test(name)) return "Indianapolis 500";
  const gp = /\bGrand Prix (of|at) .+$/.exec(name);
  return gp ? gp[0].trim() : name.trim();
}

/**
 * MotoGP Round names: the Grand Prix's common English name for the Circuit, without sponsors.
 * sportstimes' `name` is a country in assorted languages ("España", "Hungria", "Czeck Republiky") and
 * repeats across Rounds (four in Spain), so it can't be used as is. A Circuit missing here falls back
 * to "<name> Grand Prix" with a warning.
 */
export const MOTOGP_ROUND_NAMES: Record<string, string> = {
  buriram: "Thai Grand Prix",
  goiania: "Brazilian Grand Prix",
  cota: "Grand Prix of the Americas",
  jerez: "Spanish Grand Prix",
  "le-mans": "French Grand Prix",
  catalunya: "Catalan Grand Prix",
  mugello: "Italian Grand Prix",
  "balaton-park": "Hungarian Grand Prix",
  brno: "Czech Grand Prix",
  assen: "Dutch TT",
  sachsenring: "German Grand Prix",
  silverstone: "British Grand Prix",
  aragon: "Aragon Grand Prix",
  misano: "San Marino Grand Prix",
  "red-bull-ring": "Austrian Grand Prix",
  motegi: "Japanese Grand Prix",
  mandalika: "Indonesian Grand Prix",
  "phillip-island": "Australian Grand Prix",
  sepang: "Malaysian Grand Prix",
  lusail: "Qatar Grand Prix",
  portimao: "Portuguese Grand Prix",
  valencia: "Valencia Grand Prix",
};

/** Coordinates within this distance of a Circuit match it outright. */
const MOTOGP_NEAR_KM = 10;
/** Up to this distance a match also needs the same country (sportstimes puts Mandalika ~27 km off). */
const MOTOGP_MAX_KM = 50;
/** FE coordinates are city centres; a name-matched Circuit further away than this is suspicious. */
const FE_SANITY_KM = 100;

function coordinate(value: number | string | undefined): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n !== 0 ? n : null;
}

function sameCountry(a: string, b: string): boolean {
  return slugify(a) === slugify(b);
}

/** The MotoGP Circuit at a Round's coordinates, or null (the Round is then flagged, never guessed). */
export function motogpCircuit(race: SportstimesRace): { circuit: Circuit; km: number } | null {
  const lat = coordinate(race.latitude);
  const lon = coordinate(race.longitude);
  if (lat === null || lon === null) return null;
  const nearest = nearestCircuit(lat, lon);
  if (!nearest) return null;
  if (nearest.km <= MOTOGP_NEAR_KM) return nearest;
  if (nearest.km <= MOTOGP_MAX_KM && race.location && sameCountry(circuitCountry(nearest.circuit), race.location)) {
    return nearest;
  }
  return null;
}

function roundName(series: SportstimesSeries, race: SportstimesRace, circuit: Circuit | null): string {
  switch (series) {
    case "f2":
    case "f3":
      return `Round ${race.round}`;
    case "fe":
      return race.name.trim();
    case "indycar":
      return cleanIndyCarRoundName(race.name);
    case "motogp":
      return (circuit && MOTOGP_ROUND_NAMES[circuit.id]) ?? `${race.name.trim()} Grand Prix`;
  }
}

export function parseSportstimes(
  data: { races: SportstimesRace[] },
  season: number,
  series: SportstimesSeries,
): SportstimesSeason {
  const warnings: string[] = [];
  const trackMismatches: string[] = [];
  const isFeeder = series === "f2" || series === "f3";

  const rounds = data.races.map((race): RawRound => {
    const sourceRef = `sportstimes ${series} ${season} round ${race.round}`;

    const sessions: RawSession[] = Object.entries(race.sessions ?? {}).map(([key, startsAt]) => {
      let known = sportstimesSession(series, key);
      // F2/F3 unknown keys are flagged as before; the newer Series keep practice-like ones.
      if (!known && !isFeeder && PRACTICE_LIKE.test(key)) {
        known = { name: key, type: "practice" };
        warnings.push(`Unknown Session key "${key}" in ${sourceRef}; kept as practice`);
      }
      return {
        key: known?.name ?? key,
        name: known?.name ?? key,
        type: known?.type ?? null,
        startsAt,
        endsAt: null,
        cancelled: race.canceled === true,
      };
    });

    let circuitId: string | null | undefined;
    let circuitHints: string[];
    let circuit: Circuit | null = null;
    if (series === "motogp") {
      const matched = motogpCircuit(race);
      circuit = matched?.circuit ?? null;
      circuitId = circuit?.id ?? null;
      circuitHints = [`${race.latitude},${race.longitude}`, race.location ?? "", race.track ?? ""].filter(Boolean);
      const byTrack = race.track ? matchCircuit([race.track]) : null;
      if (circuit && race.track && byTrack?.id !== circuit.id) {
        trackMismatches.push(`${race.round} ${race.name}: "${race.track}" → ${circuit.id}`);
      }
      if (circuit && !MOTOGP_ROUND_NAMES[circuit.id]) {
        warnings.push(`No MotoGP Round name for Circuit ${circuit.id} (${sourceRef}); using "${race.name} Grand Prix"`);
      }
    } else {
      // Location first: on equal-length alias matches the earlier hint wins ("Jarama" over "madrid-eprix").
      circuitHints = [race.location, ...(series === "indycar" ? [race.name] : []), race.slug].filter(
        (h): h is string => !!h,
      );
      if (series === "fe") {
        circuit = matchCircuit(circuitHints);
        const lat = coordinate(race.latitude);
        const lon = coordinate(race.longitude);
        const km = circuit && lat !== null && lon !== null ? distanceKm(lat, lon, circuit.lat, circuit.lon) : null;
        if (circuit && km !== null && km > FE_SANITY_KM) {
          warnings.push(`${sourceRef} "${race.name}" matched ${circuit.id}, ${Math.round(km)} km from the source coordinates`);
        }
      }
    }

    const days = sessions.map((s) => s.startsAt.slice(0, 10)).sort();
    const timesConfirmed = race.tbc !== true && sessions.length > 0;
    return {
      season,
      name: roundName(series, race, circuit),
      circuitHints,
      ...(circuitId !== undefined ? { circuitId } : {}),
      timesConfirmed,
      sessions,
      // UTC dates, not Track Time; only used when no Session times are known.
      startDate: timesConfirmed ? null : (days[0] ?? null),
      endDate: timesConfirmed ? null : (days.at(-1) ?? null),
      sourceRef,
    };
  });

  if (trackMismatches.length > 0) {
    // One warning per season: sync keeps warnings in a 2000-character lastError.
    const text = `sportstimes motogp ${season}: \`track\` disagrees with the coordinates for ${trackMismatches.length} Rounds (coordinates used): ${trackMismatches.join("; ")}`;
    warnings.push(text.length > 600 ? `${text.slice(0, 599)}…` : text);
  }
  return { rounds, warnings };
}

export function sportstimesUrl(series: SportstimesSeries, year: number): string {
  return `https://raw.githubusercontent.com/sportstimes/f1/main/_db/${series}/${year}.json`;
}

export async function fetchSportstimesSeason(ctx: SourceContext, series: SportstimesSeries, year: number): Promise<SportstimesSeason> {
  const data = await getJson<{ races: SportstimesRace[] }>(ctx, sportstimesUrl(series, year));
  return parseSportstimes(data, year, series);
}
