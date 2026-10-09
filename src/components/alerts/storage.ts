// Per-device storage for the Alerts page. Every access is wrapped: storage can be blocked or missing.
import { useSyncExternalStore } from "react";
import { REMINDER_LEAD_MINUTES, type ReminderLeadMinutes } from "@/domain/series";
import type { SeriesId } from "@/domain/types";
import { isSeriesId, normalizeFollows, type Follows } from "@/server/alerts/selection";

/** The Series the viewer last browsed (written by the Series pages). */
export const SERIES_STORAGE_KEY = "msi.series";
/** This page's own choices: ticked Session Types and lead time. */
export const ALERTS_STORAGE_KEY = "msi.alerts";

export interface SavedAlerts {
  follows: Follows;
  leadMinutes: ReminderLeadMinutes;
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSavedAlerts(value: SavedAlerts): void {
  try {
    window.localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode, blocked): choices just won't be remembered.
  }
}

export function parseRememberedSeries(raw: string | null): SeriesId | null {
  if (!raw) return null;
  // Accept a bare id or a JSON-encoded string.
  let value: unknown = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    // bare string
  }
  return isSeriesId(value) ? value : null;
}

export function parseSavedAlerts(raw: string | null): SavedAlerts | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { follows?: unknown; leadMinutes?: unknown };
    if (!value || typeof value !== "object" || !value.follows || typeof value.follows !== "object") return null;
    const follows = normalizeFollows(value.follows as Record<string, string[]>);
    const leadMinutes = (REMINDER_LEAD_MINUTES as readonly unknown[]).includes(value.leadMinutes)
      ? (value.leadMinutes as ReminderLeadMinutes)
      : REMINDER_LEAD_MINUTES[0];
    return { follows, leadMinutes };
  } catch {
    return null;
  }
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** Raw localStorage value, null during server render and hydration. */
export function useStoredString(key: string): string | null {
  return useSyncExternalStore(
    subscribeStorage,
    () => read(key),
    () => null,
  );
}
