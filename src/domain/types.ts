// Core domain types. Vocabulary is defined in CONTEXT.md — keep names in sync.

export const SERIES_IDS = ["f1", "f2", "f3", "wec", "fe", "indycar", "motogp"] as const;
export type SeriesId = (typeof SERIES_IDS)[number];

export type SessionType =
  | "practice"
  | "sprint-qualifying"
  | "sprint"
  | "qualifying"
  | "race"
  | "sprint-race"
  | "feature-race"
  | "hyperpole";

export type SessionStatus = "scheduled" | "cancelled";

export interface Circuit {
  /** Stable slug, e.g. "silverstone". */
  id: string;
  name: string;
  /** Locality shown under the circuit name, e.g. "Silverstone, United Kingdom". */
  location: string;
  lat: number;
  lon: number;
  /** IANA time zone, derived from lat/lon. */
  timeZone: string;
  /** False where RainViewer has no ground radar (e.g. Baku). */
  hasRadarCoverage: boolean;
}

export interface Session {
  /** Stable id: `${roundId}:${slug}` e.g. "f1-2026-las-vegas:qualifying". */
  id: string;
  roundId: string;
  series: SeriesId;
  type: SessionType;
  /** Display name as the series uses it, e.g. "Free Practice 1", "Hyperpole". */
  name: string;
  /** ISO 8601 UTC. */
  startsAt: string;
  /** ISO 8601 UTC. */
  endsAt: string;
  /** True when endsAt came from a default Session length, not the source. */
  endIsEstimated: boolean;
  status: SessionStatus;
}

export interface Round {
  /** Stable id: `${series}-${season}-${slug}` e.g. "f1-2026-las-vegas". */
  id: string;
  series: SeriesId;
  season: number;
  slug: string;
  /** e.g. "Las Vegas Grand Prix", "6 Hours of Barcelona", "Round 12". */
  name: string;
  circuitId: string;
  /** ISO date (YYYY-MM-DD) of the first day, in Track Time. */
  startDate: string;
  /** ISO date (YYYY-MM-DD) of the last day, in Track Time. */
  endDate: string;
  /** False when the Round's dates are known but its Session times are not ("Times TBC"). */
  sessionTimesConfirmed: boolean;
}

export type FeaturedRoundResult =
  | {
      kind: "round";
      round: Round;
      circuit: Circuit;
      /** Ordered by startsAt. Cancelled Sessions are included. */
      sessions: Session[];
    }
  | {
      kind: "season-complete";
      /** The season that just finished. */
      season: number;
    };

export interface SessionForecast {
  kind: "forecast";
  /** ISO UTC time the forecast applies to (the Session start). */
  at: string;
  /** WMO weather code, used to choose the condition icon. */
  weatherCode: number;
  isDay: boolean;
  temperatureC: number;
  precipitationProbability: number;
  windSpeedKmh: number;
  windDirectionDeg: number;
}

export type ForecastResult =
  | SessionForecast
  /** The Session is beyond the forecast horizon. */
  | { kind: "not-yet"; availableFrom: string }
  | { kind: "unavailable" };
