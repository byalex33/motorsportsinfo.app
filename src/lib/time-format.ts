// Pure helpers for showing Session times in Viewer Time or Track Time.
// Everything that depends on the viewer's zone or locale runs on the client only.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** True when `tz` is an IANA time zone this runtime understands. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The device's time zone, or UTC when it cannot be read. */
export function deviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : "UTC";
  } catch {
    return "UTC";
  }
}

/** All IANA zones the runtime supports, with UTC first. */
export function supportedTimeZones(): string[] {
  try {
    const zones = Intl.supportedValuesOf("timeZone");
    return ["UTC", ...zones.filter((z) => z !== "UTC")];
  } catch {
    return ["UTC"];
  }
}

/** Case- and separator-insensitive match for the time zone search box. */
export function filterTimeZones(zones: string[], query: string, limit = 80): string[] {
  const q = query.trim().toLowerCase().replace(/[\s_/]+/g, " ");
  if (!q) return zones.slice(0, limit);
  const out: string[] = [];
  for (const zone of zones) {
    const hay = zone.toLowerCase().replace(/[_/]+/g, " ");
    if (hay.includes(q)) out.push(zone);
    if (out.length >= limit) break;
  }
  return out;
}

/** "Los Angeles" from "America/Los_Angeles". */
export function zoneCity(tz: string): string {
  const last = tz.split("/").pop() ?? tz;
  return last.replace(/_/g, " ");
}

/** Short offset such as "GMT-8" for `tz` at instant `at`. */
export function zoneOffsetLabel(tz: string, at: Date, locale?: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale ?? "en-GB", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(at);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

/** Calendar date key (YYYY-MM-DD) of an instant in `tz`. */
export function dayKey(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export interface SessionDayParts {
  /** e.g. "Fri" */
  weekday: string;
  /** e.g. "20" */
  day: string;
  /** e.g. "Nov" */
  month: string;
  /** e.g. "Friday 20 November" (locale-dependent). */
  long: string;
}

export function formatSessionDay(iso: string, tz: string, locale?: string): SessionDayParts {
  const d = new Date(iso);
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: tz, ...o }).format(d);
  return {
    weekday: fmt({ weekday: "short" }),
    day: fmt({ day: "numeric" }),
    month: fmt({ month: "short" }),
    long: fmt({ weekday: "long", day: "numeric", month: "long" }),
  };
}

/** "00:30" / "20:30" in 24-hour locales, "8:30 PM" in 12-hour locales. */
export function formatClock(iso: string, tz: string, locale?: string): string {
  const probe = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions();
  const twentyFour = probe.hourCycle === "h23" || probe.hourCycle === "h24";
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    hour: twentyFour ? "2-digit" : "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Start–end range for a Session. When the end falls on a later calendar day in `tz`
 * (e.g. a 24-hour race), the end is suffixed with "+1" style day offset.
 */
export function formatTimeRange(
  startIso: string,
  endIso: string,
  tz: string,
  locale?: string,
  opts: { endEstimated?: boolean } = {},
): string {
  const start = formatClock(startIso, tz, locale);
  const end = `${opts.endEstimated ? "~" : ""}${formatClock(endIso, tz, locale)}`;
  const days = dayDiff(dayKey(startIso, tz), dayKey(endIso, tz));
  return days > 0 ? `${start} – ${end} (+${days})` : `${start} – ${end}`;
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Round dates (already in Track Time, YYYY-MM-DD). Locale-independent so it can render on the server.
 * "19–21 Nov 2026", "30 Oct – 1 Nov 2026", "31 Dec 2026 – 2 Jan 2027".
 */
export function formatRoundDates(startDate: string, endDate: string): string {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return startDate;
  const S = `${sd} ${MONTHS[sm - 1]}`;
  const E = `${ed} ${MONTHS[em - 1]} ${ey}`;
  if (startDate === endDate) return E;
  if (sy !== ey) return `${S} ${sy} – ${E}`;
  if (sm !== em) return `${S} – ${E}`;
  return `${sd}–${E}`;
}

/** Locale-independent "Fri 20 Nov" for a Track Time date (YYYY-MM-DD). */
export function formatIsoDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${d} ${MONTHS[m - 1]}`;
}
