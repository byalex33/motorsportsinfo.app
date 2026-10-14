import { SERIES_IDS, type SeriesId, type SessionType } from "./types";

export interface SeriesInfo {
  id: SeriesId;
  /** "main" Series are links in the header; "other" Series sit in its Other menu. */
  group: "main" | "other";
  /** Plain-text name. No official logos or marks anywhere on the site. */
  name: string;
  shortName: string;
  /** Session Types in the order they are offered for reminders. */
  sessionTypes: SessionType[];
  /** Session Types ticked by default for Session Reminders and calendar feeds. */
  defaultReminderTypes: SessionType[];
  /** Whether the Series page shows the rain radar around Session time. F1 only: radar tiles cost money. */
  hasRainRadar: boolean;
}

export const SERIES: Record<SeriesId, SeriesInfo> = {
  f1: {
    id: "f1",
    group: "main",
    name: "Formula 1",
    shortName: "F1",
    sessionTypes: ["practice", "sprint-qualifying", "sprint", "qualifying", "race"],
    defaultReminderTypes: ["sprint", "qualifying", "race"],
    hasRainRadar: true,
  },
  f2: {
    id: "f2",
    group: "other",
    name: "Formula 2",
    shortName: "F2",
    sessionTypes: ["practice", "qualifying", "sprint-race", "feature-race"],
    defaultReminderTypes: ["qualifying", "sprint-race", "feature-race"],
    hasRainRadar: false,
  },
  f3: {
    id: "f3",
    group: "other",
    name: "Formula 3",
    shortName: "F3",
    sessionTypes: ["practice", "qualifying", "sprint-race", "feature-race"],
    defaultReminderTypes: ["qualifying", "sprint-race", "feature-race"],
    hasRainRadar: false,
  },
  wec: {
    id: "wec",
    group: "main",
    name: "World Endurance Championship",
    shortName: "WEC",
    sessionTypes: ["practice", "qualifying", "hyperpole", "race"],
    defaultReminderTypes: ["qualifying", "race"],
    hasRainRadar: false,
  },
  fe: {
    id: "fe",
    group: "other",
    name: "Formula E",
    shortName: "FE",
    sessionTypes: ["practice", "qualifying", "race"],
    defaultReminderTypes: ["qualifying", "race"],
    hasRainRadar: false,
  },
  indycar: {
    id: "indycar",
    group: "main",
    name: "IndyCar Series",
    shortName: "IndyCar",
    sessionTypes: ["practice", "qualifying", "race"],
    defaultReminderTypes: ["qualifying", "race"],
    hasRainRadar: false,
  },
  motogp: {
    id: "motogp",
    group: "main",
    name: "MotoGP",
    shortName: "MotoGP",
    sessionTypes: ["practice", "qualifying", "sprint", "race"],
    defaultReminderTypes: ["sprint", "race"],
    hasRainRadar: false,
  },
  "f1-academy": {
    id: "f1-academy",
    group: "other",
    name: "F1 Academy",
    shortName: "F1 Academy",
    sessionTypes: ["practice", "qualifying", "race"],
    defaultReminderTypes: ["qualifying", "race"],
    hasRainRadar: false,
  },
  wrc: {
    id: "wrc",
    group: "other",
    name: "World Rally Championship",
    shortName: "WRC",
    sessionTypes: ["shakedown", "stages", "power-stage"],
    defaultReminderTypes: ["stages", "power-stage"],
    hasRainRadar: false,
  },
  imsa: {
    id: "imsa",
    group: "other",
    name: "IMSA WeatherTech SportsCar Championship",
    shortName: "IMSA",
    sessionTypes: ["practice", "qualifying", "race"],
    defaultReminderTypes: ["qualifying", "race"],
    hasRainRadar: false,
  },
  nascar: {
    id: "nascar",
    group: "main",
    name: "NASCAR Cup Series",
    shortName: "NASCAR",
    sessionTypes: ["practice", "qualifying", "race"],
    defaultReminderTypes: ["qualifying", "race"],
    hasRainRadar: false,
  },
  "gtwc-europe": {
    id: "gtwc-europe",
    group: "other",
    name: "GT World Challenge Europe",
    shortName: "GTWC",
    sessionTypes: ["practice", "qualifying", "race"],
    defaultReminderTypes: ["qualifying", "race"],
    hasRainRadar: false,
  },
  dtm: {
    id: "dtm",
    group: "other",
    name: "Deutsche Tourenwagen Masters",
    shortName: "DTM",
    sessionTypes: ["practice", "qualifying", "race"],
    defaultReminderTypes: ["qualifying", "race"],
    hasRainRadar: false,
  },
  "super-gt": {
    id: "super-gt",
    group: "other",
    name: "Super GT",
    shortName: "Super GT",
    sessionTypes: ["practice", "qualifying", "race"],
    defaultReminderTypes: ["qualifying", "race"],
    hasRainRadar: false,
  },
};

/** The Series shown as links in the header, in SERIES_IDS order. */
export const MAIN_SERIES_IDS: SeriesId[] = SERIES_IDS.filter((id) => SERIES[id].group === "main");
/** The Series in the header's Other menu, in SERIES_IDS order. */
export const OTHER_SERIES_IDS: SeriesId[] = SERIES_IDS.filter((id) => SERIES[id].group === "other");
/**
 * Every Series in the order lists show them: the header's links, then the Other menu. SERIES_IDS keeps its
 * own order, which calendar feed URLs are built in.
 */
export const DISPLAY_SERIES_IDS: SeriesId[] = [...MAIN_SERIES_IDS, ...OTHER_SERIES_IDS];

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  practice: "Practice",
  "sprint-qualifying": "Sprint Qualifying",
  sprint: "Sprint",
  qualifying: "Qualifying",
  race: "Race",
  "sprint-race": "Sprint Race",
  "feature-race": "Feature Race",
  hyperpole: "Hyperpole",
  shakedown: "Shakedown",
  stages: "Stages",
  "power-stage": "Power Stage",
};

/**
 * Session length used only when the source gives no end time. `sessionName` is the Session's name,
 * or the Round's name where that carries the length ("6 Hours of Spa", "Indianapolis 500").
 */
export function defaultSessionMinutes(series: SeriesId, type: SessionType, sessionName: string): number {
  if (series === "f1" && type === "race") return 120;
  if (series === "wec" && type === "race") {
    const hours = /(\d+)\s*hours?/i.exec(sessionName);
    return hours ? Number(hours[1]) * 60 : 360;
  }
  if (series === "fe") return { practice: 30, qualifying: 75, race: 60 }[type as string] ?? 60;
  if (series === "indycar") {
    if (type === "race") return /indianapolis 500|indy 500/i.test(sessionName) ? 210 : 150;
    return 60;
  }
  if (series === "motogp") {
    if (/warm/i.test(sessionName)) return 10;
    // Names may be followed by the Round name ("Q1 British Grand Prix").
    if (/^q[12]\b|qualifying [12]/i.test(sessionName)) return 15;
    // FP2 is 30 minutes (Q1 starts 40 minutes after it); the Friday "Practice" that decides Q2 is an hour.
    if (/^(free practice 2|fp2)\b/i.test(sessionName)) return 30;
    if (/^practice\b/i.test(sessionName)) return 60;
    return { practice: 45, qualifying: 15, sprint: 25, race: 45 }[type as string] ?? 45;
  }
  if (series === "f1-academy") return { practice: 40, qualifying: 30, race: 30 }[type as string] ?? 40;
  // A rally day's end comes from its last stage (see sources/wrc.ts); these cover the rest.
  if (series === "wrc") return { shakedown: 180, stages: 480, "power-stage": 45 }[type as string] ?? 60;
  if (series === "imsa") {
    if (type !== "race") return type === "qualifying" ? 75 : 90;
    if (/\b24\b/.test(sessionName)) return 1440;
    if (/petit le mans/i.test(sessionName)) return 600;
    const words: Record<string, number> = { six: 6, ten: 10, twelve: 12 };
    const hours = /(\d+|six|ten|twelve)\s*hours?/i.exec(sessionName);
    if (!hours) return 160;
    return (Number(hours[1]) || words[hours[1].toLowerCase()]) * 60;
  }
  if (series === "nascar") {
    if (/duel/i.test(sessionName)) return 75;
    if (type !== "race") return type === "qualifying" ? 60 : 50;
    if (/\b600\b/.test(sessionName)) return 270;
    return /\b500\b/.test(sessionName) ? 210 : 180;
  }
  // Names are followed by the Round name ("Main Race 24 Hours of Spa", "Qualifying 1 Barcelona").
  if (series === "gtwc-europe") {
    if (/warm/i.test(sessionName)) return 15;
    if (type === "practice") return 60;
    // Endurance Cup qualifying is one Session of three 15-minute parts; Sprint Cup's are 15 minutes each.
    if (type === "qualifying") return /superpole/i.test(sessionName) ? 30 : /qualifying\s*\d|group/i.test(sessionName) ? 15 : 70;
    // Endurance Cup races are "Main Race": the 24 Hours of Spa, six hours at Paul Ricard, three hours elsewhere.
    if (/^main race/i.test(sessionName)) return /\b24 hours\b/i.test(sessionName) ? 1440 : /paul ricard/i.test(sessionName) ? 360 : 180;
    return 60;
  }
  // DTM gives every end time; these only cover a Session listed without one.
  if (series === "dtm") return { practice: 45, qualifying: 20, race: 60 }[type as string] ?? 45;
  // Super GT gives end times for most Sessions; a race listed by laps ("82Laps") has none.
  if (series === "super-gt") {
    if (/warm/i.test(sessionName)) return 20;
    return { practice: 90, qualifying: 30, race: 120 }[type as string] ?? 60;
  }
  return 60;
}

/**
 * The Series' official results page, linked from a finished Session when the site has no Session Result
 * of its own. Season-level pages: per-Round URLs on these sites don't follow our Round slugs.
 */
export function officialResultsUrl(series: SeriesId, season: number): string {
  switch (series) {
    case "f1":
      return `https://www.formula1.com/en/results/${season}/races`;
    case "f2":
      return `https://www.fiaformula2.com/en/racing/${season}`;
    case "f3":
      return `https://www.fiaformula3.com/en/racing/${season}`;
    case "wec":
      return "https://www.fiawec.com/en/page/resultats-1";
    case "fe":
      return "https://www.fiaformulae.com/en/results-and-standings";
    case "indycar":
      return "https://www.indycar.com/results";
    case "motogp":
      return "https://www.motogp.com/en/gp-results";
    case "f1-academy":
      return "https://www.f1academy.com/Racing-Series/Calendar";
    case "wrc":
      return "https://www.wrc.com/en/results-and-standings";
    case "imsa":
      return "https://www.imsa.com/weathertech/results/";
    case "nascar":
      return `https://www.nascar.com/nascar-cup-series/${season}/schedule/`;
    case "gtwc-europe":
      return "https://www.gt-world-challenge-europe.com/results";
    case "dtm":
      return "https://www.dtm.com/en/results";
    case "super-gt":
      return "https://supergt.net/en/driver_ranking";
  }
}

/**
 * Whether the Series counts this Round in its numbering. NASCAR's exhibition races (the Clash, the All-Star
 * Race) are Rounds here but not numbered: the Daytona 500 is race 1.
 */
export function isNumberedRound(series: SeriesId, roundName: string): boolean {
  return !(series === "nascar" && /\bclash\b|\ball-star\b/i.test(roundName));
}

/** A Round stays the Featured Round until this long after its final Session ends. */
export const FEATURED_ROUND_GRACE_MINUTES = 120;

/** The rain radar shows from this long before a Session starts until it ends. */
export const RADAR_LEAD_MINUTES = 60;

export const REMINDER_LEAD_MINUTES = [15, 60, 1440] as const;
export type ReminderLeadMinutes = (typeof REMINDER_LEAD_MINUTES)[number];
