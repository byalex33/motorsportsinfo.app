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
}

export const SERIES: Record<SeriesId, SeriesInfo> = {
  f1: {
    id: "f1",
    name: "Formula 1",
    shortName: "F1",
    sessionTypes: ["practice", "sprint-qualifying", "sprint", "qualifying", "race"],
    defaultReminderTypes: ["sprint", "qualifying", "race"],
  },
  f2: {
    id: "f2",
    name: "Formula 2",
    shortName: "F2",
    sessionTypes: ["practice", "qualifying", "sprint-race", "feature-race"],
    defaultReminderTypes: ["qualifying", "sprint-race", "feature-race"],
  },
  f3: {
    id: "f3",
    name: "Formula 3",
    shortName: "F3",
    sessionTypes: ["practice", "qualifying", "sprint-race", "feature-race"],
    defaultReminderTypes: ["qualifying", "sprint-race", "feature-race"],
  },
  wec: {
    id: "wec",
    name: "World Endurance Championship",
    shortName: "WEC",
    sessionTypes: ["practice", "qualifying", "hyperpole", "race"],
    defaultReminderTypes: ["qualifying", "race"],
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

/** Session length used only when the source gives no end time. */
export function defaultSessionMinutes(series: SeriesId, type: SessionType, sessionName: string): number {
  if (series === "f1" && type === "race") return 120;
  if (series === "wec" && type === "race") {
    const hours = /(\d+)\s*hours?/i.exec(sessionName);
    return hours ? Number(hours[1]) * 60 : 360;
  }
  return 60;
}

/** A Round stays the Featured Round until this long after its final Session ends. */
export const FEATURED_ROUND_GRACE_MINUTES = 120;

/** The rain radar shows from this long before a Session starts until it ends. */
export const RADAR_LEAD_MINUTES = 60;

export const REMINDER_LEAD_MINUTES = [15, 60, 1440] as const;
export type ReminderLeadMinutes = (typeof REMINDER_LEAD_MINUTES)[number];
