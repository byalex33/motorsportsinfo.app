// Track Time text rendered on the server, so Session times are in the HTML that crawlers (and viewers
// before hydration) see. The client shows these exact strings until it knows the viewer's zone, then
// switches to Viewer Time — the strings travel as props, so server HTML and hydration always match.
import type { Session } from "@/domain/types";
import { formatClock, formatSessionDay, formatTimeRange, zoneOffsetLabel } from "@/lib/time-format";

/** Fixed locale for server-rendered text: 24-hour clock, "Sat 10 Oct". */
const LOCALE = "en-GB";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface TrackTimeText {
  /** "Sat" */
  weekday: string;
  /** "10" */
  day: string;
  /** "Saturday 10 October" */
  long: string;
  /** "Sat 10 Oct 2026" */
  date: string;
  /** "21:30" */
  clock: string;
  /** "21:30 – 22:30", with "~" before an estimated end and "(+1)" past midnight. */
  range: string;
  /** Short UTC offset of the Circuit at the Session start, e.g. "GMT+8". */
  offset: string;
  /** "13:30" */
  utcClock: string;
}

/** Track Time text for one Session in the Circuit's zone `tz`. */
export function trackTimeText(session: Session, tz: string): TrackTimeText {
  const start = new Date(session.startsAt);
  const day = formatSessionDay(session.startsAt, tz, LOCALE);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "numeric" }).formatToParts(start);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 0);
  return {
    weekday: day.weekday,
    day: day.day,
    long: day.long,
    date: `${day.weekday} ${day.day} ${MONTHS[month - 1] ?? day.month} ${year}`,
    clock: formatClock(session.startsAt, tz, LOCALE),
    range: formatTimeRange(session.startsAt, session.endsAt, tz, LOCALE, { endEstimated: session.endIsEstimated }),
    offset: zoneOffsetLabel(tz, start, LOCALE),
    utcClock: formatClock(session.startsAt, "UTC", LOCALE),
  };
}

/** Track Time text for every Session, keyed by Session id. Plain data, safe to pass to client components. */
export function trackTimeTexts(sessions: Session[], tz: string): Record<string, TrackTimeText> {
  return Object.fromEntries(sessions.map((s) => [s.id, trackTimeText(s, tz)]));
}

/** "Qualifying starts Sat 10 Oct 2026, 21:30 track time (GMT+8) · 13:30 UTC." */
export function sessionStartSentence(name: string, text: TrackTimeText, live = false): string {
  const when = `${text.date}, ${text.clock} track time (${text.offset}) · ${text.utcClock} UTC`;
  return live ? `${name} is live. It started ${when}.` : `${name} starts ${when}.`;
}

/**
 * The instant `iso` written in the zone's wall time with its UTC offset, e.g. "2026-10-10T21:30:00+08:00".
 * Schema.org dates carry the offset so search engines show the right local time.
 */
export function isoWithOffset(iso: string, tz: string): string {
  const at = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(at);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  // "GMT+08:00", "GMT-04:00", or plain "GMT" at UTC+0.
  const offset = get("timeZoneName").replace(/^(GMT|UTC)/, "").replace("−", "-") || "+00:00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${offset}`;
}
