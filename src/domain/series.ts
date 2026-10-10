import type { SeriesId, SessionType } from "./types";

export interface SeriesInfo {
  id: SeriesId;
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
    name: "Formula 1",
    shortName: "F1",
    sessionTypes: ["practice", "sprint-qualifying", "sprint", "qualifying", "race"],
    defaultReminderTypes: ["sprint", "qualifying", "race"],
    hasRainRadar: true,
  },
  f2: {
    id: "f2",
    name: "Formula 2",
    shortName: "F2",
    sessionTypes: ["practice", "qualifying", "sprint-race", "feature-race"],
    defaultReminderTypes: ["qualifying", "sprint-race", "feature-race"],
    hasRainRadar: false,
  },
  f3: {
    id: "f3",
    name: "Formula 3",
    shortName: "F3",
    sessionTypes: ["practice", "qualifying", "sprint-race", "feature-race"],
    defaultReminderTypes: ["qualifying", "sprint-race", "feature-race"],
    hasRainRadar: false,
  },
  wec: {
    id: "wec",
    name: "World Endurance Championship",
    shortName: "WEC",
    sessionTypes: ["practice", "qualifying", "hyperpole", "race"],
    defaultReminderTypes: ["qualifying", "race"],
    hasRainRadar: false,
  },
  fe: {
    id: "fe",
    name: "Formula E",
    shortName: "FE",
    sessionTypes: ["practice", "qualifying", "race"],
    defaultReminderTypes: ["qualifying", "race"],
    hasRainRadar: false,
  },
  indycar: {
    id: "indycar",
    name: "IndyCar Series",
    shortName: "IndyCar",
    sessionTypes: ["practice", "qualifying", "race"],
    defaultReminderTypes: ["qualifying", "race"],
    hasRainRadar: false,
  },
  motogp: {
    id: "motogp",
    name: "MotoGP",
    shortName: "MotoGP",
    sessionTypes: ["practice", "qualifying", "sprint", "race"],
    defaultReminderTypes: ["sprint", "race"],
    hasRainRadar: false,
  },
};

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  practice: "Practice",
  "sprint-qualifying": "Sprint Qualifying",
  sprint: "Sprint",
  qualifying: "Qualifying",
  race: "Race",
  "sprint-race": "Sprint Race",
  "feature-race": "Feature Race",
  hyperpole: "Hyperpole",
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
  }
}

/** A Round stays the Featured Round until this long after its final Session ends. */
export const FEATURED_ROUND_GRACE_MINUTES = 120;

/** The rain radar shows from this long before a Session starts until it ends. */
export const RADAR_LEAD_MINUTES = 60;

export const REMINDER_LEAD_MINUTES = [15, 60, 1440] as const;
export type ReminderLeadMinutes = (typeof REMINDER_LEAD_MINUTES)[number];
