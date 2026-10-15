// Pure helpers for "which Session Types of which Series" — used by the Alerts page (client),
// the subscribe endpoint, the cron and the calendar feed. No server-only imports here.
import { SERIES } from "@/domain/series";
import { SERIES_IDS, type SeriesId, type SessionType } from "@/domain/types";
import type { Follows } from "@/db/schema";

export type { Follows };

/** Short URL codes for each Session Type, used in calendar feed URLs. Never change existing codes. */
export const SESSION_TYPE_CODES: Record<SessionType, string> = {
  practice: "p",
  "sprint-qualifying": "sq",
  sprint: "s",
  qualifying: "q",
  race: "r",
  "sprint-race": "sr",
  "feature-race": "fr",
  hyperpole: "h",
  shakedown: "sd",
  stages: "st",
  "power-stage": "ps",
};

const CODE_TO_TYPE = new Map<string, SessionType>(
  Object.entries(SESSION_TYPE_CODES).map(([type, code]) => [code, type as SessionType]),
);

/** Keeps only valid Series and their valid Session Types, deduped, in the Series' own order. Drops empty Series. */
export function normalizeFollows(input: Partial<Record<string, readonly string[]>>): Follows {
  const out: Follows = {};
  for (const series of SERIES_IDS) {
    const wanted: unknown = input[series];
    if (!Array.isArray(wanted)) continue;
    const types = SERIES[series].sessionTypes.filter((t) => wanted.includes(t));
    if (types.length > 0) out[series] = types;
  }
  return out;
}

/** Default ticks: the remembered Series' defaultReminderTypes, nothing for the others. */
export function defaultFollows(remembered: SeriesId | null): Follows {
  if (!remembered) return {};
  return { [remembered]: [...SERIES[remembered].defaultReminderTypes] };
}

export function followedSeries(follows: Follows): SeriesId[] {
  return SERIES_IDS.filter((s) => (follows[s]?.length ?? 0) > 0);
}

/** Unique Session Types across all followed Series. */
export function followedSessionTypes(follows: Follows): SessionType[] {
  const set = new Set<SessionType>();
  for (const s of followedSeries(follows)) for (const t of follows[s] ?? []) set.add(t);
  return [...set];
}

export function isFollowing(follows: Follows, series: SeriesId, type: SessionType): boolean {
  return follows[series]?.includes(type) ?? false;
}

export function toggleFollow(follows: Follows, series: SeriesId, type: SessionType, on: boolean): Follows {
  const current = new Set(follows[series] ?? []);
  if (on) current.add(type);
  else current.delete(type);
  return normalizeFollows({ ...follows, [series]: [...current] });
}

/**
 * Encodes a selection as a URL path segment, e.g. `f1-q-r_wec-h-r`.
 * Canonical: Series in SERIES_IDS order and Session Types in each Series' order, so the
 * same selection always yields the same URL (and the same CDN cache entry).
 */
export function encodeSelection(follows: Follows): string {
  const normalized = normalizeFollows(follows);
  return followedSeries(normalized)
    .map((s) => [s, ...(normalized[s] ?? []).map((t) => SESSION_TYPE_CODES[t])].join("-"))
    .join("_");
}

/** Inverse of encodeSelection. Returns null for anything malformed, unknown or empty. */
export function decodeSelection(spec: string): Follows | null {
  if (!spec || spec.length > 200) return null;
  const follows: Partial<Record<SeriesId, SessionType[]>> = {};
  for (const group of spec.split("_")) {
    // Series ids may contain "-" ("f1-academy"); Session Type codes never do.
    const series = SERIES_IDS.filter((id) => group.startsWith(`${id}-`)).sort((a, b) => b.length - a.length)[0];
    const codes = series ? group.slice(series.length + 1).split("-") : [];
    if (!series || follows[series] || codes.length === 0) return null;
    const types: SessionType[] = [];
    for (const code of codes) {
      const type = CODE_TO_TYPE.get(code);
      if (!type || !SERIES[series].sessionTypes.includes(type) || types.includes(type)) return null;
      types.push(type);
    }
    follows[series] = types;
  }
  const normalized = normalizeFollows(follows);
  return followedSeries(normalized).length > 0 ? normalized : null;
}

export const CALENDAR_PATH_PREFIX = "/calendar/";
export const CALENDAR_FILE_SUFFIX = ".ics";

/** Path of the calendar feed for a selection, e.g. `/calendar/f1-q-r.ics`. Null when nothing is ticked. */
export function calendarFeedPath(follows: Follows): string | null {
  const spec = encodeSelection(follows);
  return spec ? `${CALENDAR_PATH_PREFIX}${spec}${CALENDAR_FILE_SUFFIX}` : null;
}

/** Parses the `[spec]` route segment (with or without the `.ics` suffix). */
export function parseCalendarSegment(segment: string): Follows | null {
  const spec = segment.endsWith(CALENDAR_FILE_SUFFIX) ? segment.slice(0, -CALENDAR_FILE_SUFFIX.length) : segment;
  return decodeSelection(spec);
}

/** Links for the feed builder: https URL to copy, webcal:// for Apple Calendar, Google Calendar subscribe link. */
export function calendarFeedLinks(host: string, protocol: "https:" | "http:", follows: Follows) {
  const path = calendarFeedPath(follows);
  if (!path) return null;
  const httpUrl = `${protocol}//${host}${path}`;
  const webcalUrl = `webcal://${host}${path}`;
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
  return { httpUrl, webcalUrl, googleUrl };
}
