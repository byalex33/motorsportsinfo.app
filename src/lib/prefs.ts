// Viewer preferences kept only on the device.
// SHARED CONTRACT with the alerts work — keys and JSON shapes must not change:
//   msi.series → a SeriesId string, e.g. "f1"
//   msi.time   → JSON { "mode": "viewer" | "track" | "custom", "tz"?: string }
//   msi.units  → JSON { "temp": "c" | "f", "wind": "kmh" | "mph" }
//   msi.oss-note → "dismissed" once the open-source note is closed (not part of the alerts contract)
//   msi.announcement → the id of the last Special Event announcement closed (not part of the alerts contract)
//   msi.alerts → JSON { "follows": { [SeriesId]: SessionType[] }, "leadMinutes": 15 | 60 | 1440,
//                "documentAlerts": { [FiaDocumentSeries]: "stewards" | "all" } }, the Alerts page's choices
// Every storage access is wrapped in try/catch; without storage the choice lives in memory for the visit.
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { REMINDER_LEAD_MINUTES, type ReminderLeadMinutes } from "@/domain/series";
import type { SeriesId } from "@/domain/types";
import { isSeriesId } from "@/lib/series-id";
import { isValidTimeZone } from "@/lib/time-format";
import { normalizeDocumentAlerts, type DocumentAlerts } from "@/server/alerts/document-alerts";
import { normalizeFollows, type Follows } from "@/server/alerts/selection";

export const PREF_KEYS = {
  series: "msi.series",
  time: "msi.time",
  units: "msi.units",
  openSourceNote: "msi.oss-note",
  announcement: "msi.announcement",
  alerts: "msi.alerts",
} as const;

export type PrefKey = (typeof PREF_KEYS)[keyof typeof PREF_KEYS];

export type TimeMode = "viewer" | "track" | "custom";
export interface TimePref {
  mode: TimeMode;
  tz?: string;
}

export type TempUnit = "c" | "f";
export type WindUnit = "kmh" | "mph";
export interface UnitsPref {
  temp: TempUnit;
  wind: WindUnit;
}

export const DEFAULT_TIME_PREF: TimePref = { mode: "viewer" };

/** The Alerts page's choices: ticked Session Types, Session Reminder lead time and Document Alerts. */
export interface SavedAlerts {
  follows: Follows;
  leadMinutes: ReminderLeadMinutes;
  documentAlerts: DocumentAlerts;
}

// ---------------------------------------------------------------------------
// Parsing (pure)

export function parseSeriesPref(raw: string | null | undefined): SeriesId | null {
  return isSeriesId(raw) ? raw : null;
}

function parseJson(raw: string | null | undefined): unknown {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Unknown or broken values fall back to Viewer Time on the device zone. */
export function parseTimePref(raw: string | null | undefined): TimePref {
  const value = parseJson(raw);
  if (!value || typeof value !== "object") return DEFAULT_TIME_PREF;
  const { mode, tz } = value as { mode?: unknown; tz?: unknown };
  if (mode === "viewer" || mode === "track") return { mode };
  if (mode === "custom" && isValidTimeZone(tz)) return { mode, tz };
  return DEFAULT_TIME_PREF;
}

/** Null when nothing valid is stored, so the caller can fall back to the locale default. */
export function parseUnitsPref(raw: string | null | undefined): UnitsPref | null {
  const value = parseJson(raw);
  if (!value || typeof value !== "object") return null;
  const { temp, wind } = value as { temp?: unknown; wind?: unknown };
  if ((temp === "c" || temp === "f") && (wind === "kmh" || wind === "mph")) return { temp, wind };
  return null;
}

/** Null when nothing usable is stored, so the Alerts page falls back to its defaults. Junk inside is dropped. */
export function parseSavedAlerts(raw: string | null | undefined): SavedAlerts | null {
  const value = parseJson(raw);
  if (!value || typeof value !== "object") return null;
  const { follows, leadMinutes, documentAlerts } = value as { follows?: unknown; leadMinutes?: unknown; documentAlerts?: unknown };
  if (!follows || typeof follows !== "object") return null;
  return {
    follows: normalizeFollows(follows as Record<string, string[]>),
    leadMinutes: (REMINDER_LEAD_MINUTES as readonly unknown[]).includes(leadMinutes)
      ? (leadMinutes as ReminderLeadMinutes)
      : REMINDER_LEAD_MINUTES[0],
    // Saved before Document Alerts existed: none chosen.
    documentAlerts: normalizeDocumentAlerts(documentAlerts),
  };
}

const FAHRENHEIT_REGIONS = new Set(["US", "LR", "MM", "BS", "BZ", "KY", "PW", "FM", "MH"]);
const MPH_REGIONS = new Set(["US", "GB", "LR", "MM"]);

/** Region of a BCP 47 locale, e.g. "en-US" → "US". Bare languages are maximised ("en" → "US"). */
export function localeRegion(locale: string | undefined): string | null {
  if (!locale) return null;
  try {
    const loc = new Intl.Locale(locale);
    return loc.region ?? loc.maximize().region ?? null;
  } catch {
    return null;
  }
}

/** °F/mph in the US (and the few other °F countries), mph in the UK, else °C and km/h. */
export function defaultUnitsForLocale(locale: string | undefined): UnitsPref {
  const region = localeRegion(locale);
  return {
    temp: region && FAHRENHEIT_REGIONS.has(region) ? "f" : "c",
    wind: region && MPH_REGIONS.has(region) ? "mph" : "kmh",
  };
}

// ---------------------------------------------------------------------------
// Storage (client)

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function readPref(key: PrefKey): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: PrefKey, value: string): void {
  if (readPref(key) === value) return;
  try {
    window.localStorage.setItem(key, value);
    memory.delete(key);
  } catch {
    memory.set(key, value);
  }
  notify();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || (Object.values(PREF_KEYS) as string[]).includes(e.key)) callback();
  };
  try {
    window.addEventListener("storage", onStorage);
  } catch {
    // no window events — in-tab updates still notify
  }
  return () => {
    listeners.delete(callback);
    try {
      window.removeEventListener("storage", onStorage);
    } catch {
      // ignore
    }
  };
}

/** Raw stored string; `undefined` while server-rendering or hydrating (storage not yet read). */
function useStoredString(key: PrefKey): string | null | undefined {
  return useSyncExternalStore<string | null | undefined>(
    subscribe,
    () => readPref(key),
    () => undefined,
  );
}

export interface PrefState<T> {
  value: T;
  /** False on the server and during hydration, when storage has not been read. */
  ready: boolean;
  set: (next: T) => void;
}

export function useSeriesPref(): PrefState<SeriesId | null> {
  const raw = useStoredString(PREF_KEYS.series);
  const set = useCallback((next: SeriesId | null) => {
    if (next) writePref(PREF_KEYS.series, next);
  }, []);
  return { value: parseSeriesPref(raw), ready: raw !== undefined, set };
}

export function useTimePref(): PrefState<TimePref> {
  const raw = useStoredString(PREF_KEYS.time);
  const value = useMemo(() => parseTimePref(raw), [raw]);
  const set = useCallback((next: TimePref) => {
    writePref(PREF_KEYS.time, JSON.stringify(next.mode === "custom" ? { mode: next.mode, tz: next.tz } : { mode: next.mode }));
  }, []);
  return { value, ready: raw !== undefined, set };
}

function browserLocale(): string | undefined {
  try {
    return navigator.language;
  } catch {
    return undefined;
  }
}

export function useUnitsPref(): PrefState<UnitsPref> {
  const raw = useStoredString(PREF_KEYS.units);
  const value = useMemo(() => {
    if (raw === undefined) return defaultUnitsForLocale(undefined);
    return parseUnitsPref(raw) ?? defaultUnitsForLocale(browserLocale());
  }, [raw]);
  const set = useCallback((next: UnitsPref) => {
    writePref(PREF_KEYS.units, JSON.stringify({ temp: next.temp, wind: next.wind }));
  }, []);
  return { value, ready: raw !== undefined, set };
}

/** True once the viewer has closed the "We're open source" note; false while hydrating, so it never flashes. */
export function useOpenSourceNoteDismissed(): PrefState<boolean> {
  const raw = useStoredString(PREF_KEYS.openSourceNote);
  const set = useCallback((next: boolean) => {
    writePref(PREF_KEYS.openSourceNote, next ? "dismissed" : "");
  }, []);
  return { value: raw === "dismissed", ready: raw !== undefined, set };
}

/**
 * The id of the Special Event announcement the viewer last closed; null when none, and while hydrating, so a
 * closed announcement never flashes. A newer Special Event has a new id, so its announcement shows again.
 */
export function useDismissedAnnouncement(): PrefState<string | null> {
  const raw = useStoredString(PREF_KEYS.announcement);
  const set = useCallback((next: string | null) => {
    writePref(PREF_KEYS.announcement, next ?? "");
  }, []);
  return { value: raw || null, ready: raw !== undefined, set };
}

/** What the Alerts page saved on this device; null when nothing was saved, and while hydrating. */
export function useSavedAlertsPref(): PrefState<SavedAlerts | null> {
  const raw = useStoredString(PREF_KEYS.alerts);
  const value = useMemo(() => parseSavedAlerts(raw), [raw]);
  const set = useCallback((next: SavedAlerts | null) => {
    if (!next) return;
    const { follows, leadMinutes, documentAlerts } = next;
    writePref(PREF_KEYS.alerts, JSON.stringify({ follows, leadMinutes, documentAlerts }));
  }, []);
  return { value, ready: raw !== undefined, set };
}
