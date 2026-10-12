// Core domain types. Vocabulary is defined in CONTEXT.md — keep names in sync.

export const SERIES_IDS = [
  "f1",
  "f2",
  "f3",
  "wec",
  "fe",
  "indycar",
  "motogp",
  "f1-academy",
  "wrc",
  "imsa",
  "nascar",
] as const;
export type SeriesId = (typeof SERIES_IDS)[number];

export type SessionType =
  | "practice"
  | "sprint-qualifying"
  | "sprint"
  | "qualifying"
  | "race"
  | "sprint-race"
  | "feature-race"
  | "hyperpole"
  | "shakedown"
  | "stages"
  | "power-stage";

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
      /** The Round's place in its season, e.g. 18 for Round 18; null for a Round the Series doesn't number. */
      roundNumber: number | null;
      circuit: Circuit;
      /** Ordered by startsAt. Cancelled Sessions are included. */
      sessions: Session[];
    }
  | {
      kind: "season-complete";
      /** The season that just finished. */
      season: number;
    };

/** One line of a Session Result. */
export interface SessionResultEntry {
  /** null when not classified (retired too early, did not start, disqualified). */
  position: number | null;
  /** e.g. "Max Verstappen". */
  name: string;
  team: string | null;
  /**
   * Ready to show. The leader's time ("1:47:14.808" race, "1:32.274" lap) and the others' gaps ("+2.307",
   * "+1 LAP"); in qualifying, each driver's own best lap. "DNF", "DNS" or "DSQ" instead when they apply.
   */
  time: string | null;
}

export interface SessionResult {
  /** The full classification: classified drivers in order, then the unclassified. */
  entries: SessionResultEntry[];
}

/** A driver in a Session's Telemetry. */
export interface TelemetryDriver {
  number: number;
  /** Three-letter code, e.g. "VER". */
  code: string;
  name: string;
  team: string | null;
  /** The team's colour as the source gives it, e.g. "#4781D7"; null when unknown. */
  color: string | null;
  /** Classified position; null when not classified or before the classification is published. */
  position: number | null;
}

/** One lap of one driver, as timed. Times in seconds, speeds in km/h. */
export interface TelemetryLap {
  lap: number;
  /** ISO 8601 UTC; null when the source does not say. */
  startsAt: string | null;
  /** null for a lap without a time (an aborted lap, or one ended in the pit lane). */
  time: number | null;
  sectors: [number | null, number | null, number | null];
  /** Speed trap, and the two intermediate timing points. */
  trapSpeed: number | null;
  i1Speed: number | null;
  i2Speed: number | null;
  /** The lap out of the pit lane, never a representative time. */
  pitOut: boolean;
}

/** Everything timed in one finished F1 Session, for choosing what to compare. */
export interface SessionTelemetry {
  /** Classification order; drivers with no position last. */
  drivers: TelemetryDriver[];
  /** Keyed by driver number, in lap order. */
  laps: Record<number, TelemetryLap[]>;
}

/** One driver's lap resampled onto a LapComparison's distance grid. */
export interface LapTrace {
  lap: number;
  time: number;
  /** km/h. */
  speed: number[];
  /** 0–100 %. */
  throttle: number[];
  /** 0 or 100: the source only says whether the brake is on. */
  brake: number[];
  gear: number[];
}

/** A stretch of the lap and who was quicker through it. */
export interface MiniSector {
  /** Indexes into the LapComparison's distance grid. */
  from: number;
  to: number;
  /** Seconds driver A gained on driver B here; negative where B was quicker. */
  gain: number;
}

/** Two drivers' laps lined up by distance around the track, so they can be compared point by point. */
export interface LapComparison {
  /** Metres from the start of the lap, evenly spaced. */
  distance: number[];
  a: LapTrace;
  b: LapTrace;
  /** Seconds driver B is behind driver A at each distance; negative where B is ahead. */
  delta: number[];
  /** The track at each distance, from driver A's lap (OpenF1's own units). Empty when position data is missing. */
  x: number[];
  y: number[];
  miniSectors: MiniSector[];
}

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

/** Series whose official documents the FIA publishes on fia.com/documents. */
export const FIA_DOCUMENT_SERIES = ["f1", "f2", "f3"] as const;
export type FiaDocumentSeries = (typeof FIA_DOCUMENT_SERIES)[number];

/** Stewards: decisions, summons, infringements. Results: classifications, grids, standings. */
export type FiaDocumentKind = "stewards" | "results" | "other";

/** Which new FIA Documents a device gets a Document Alert for: stewards' documents only, or all of them. */
export type DocumentAlertLevel = "stewards" | "all";

export interface FiaDocument {
  /** The FIA's running number within the Round ("Doc 33"), or null when the title has none. */
  number: number | null;
  /** Title without the "Doc n - " prefix. */
  title: string;
  kind: FiaDocumentKind;
  /** Absolute link to the PDF on fia.com (which always downloads it). */
  url: string;
  /** The PDF's name in the FIA's decision-document folder, which our viewer can open; null for a PDF elsewhere. */
  file: string | null;
  /** ISO 8601 UTC, or null when the page gives no readable time. */
  publishedAt: string | null;
}

export type RoundDocumentsResult =
  | {
      kind: "documents";
      /** The FIA's name for the Round, e.g. "Singapore Grand Prix" or "Baku". */
      event: string;
      /** Newest first. */
      documents: FiaDocument[];
      /** The fia.com page they were read from. */
      sourceUrl: string;
    }
  /** The FIA has not published anything for this Round yet. */
  | { kind: "none"; sourceUrl: string }
  | { kind: "unavailable"; sourceUrl: string };

export type ForecastResult =
  | SessionForecast
  /** The Session is beyond the forecast horizon. */
  | { kind: "not-yet"; availableFrom: string }
  | { kind: "unavailable" };
