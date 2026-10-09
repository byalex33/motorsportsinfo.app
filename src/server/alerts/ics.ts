// Hand-written iCalendar (RFC 5545) output for calendar feeds. Pure: no I/O.
import { SERIES } from "@/domain/series";
import type { SessionWithContext } from "@/server/schedule";

export const SITE_ORIGIN = "https://motorsportsinfo.app";
const UID_DOMAIN = "motorsportsinfo.app";
const MAX_LINE_OCTETS = 75;

/** Escapes a TEXT value: backslash, semicolon, comma and newlines (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

function utf8Length(char: string): number {
  const cp = char.codePointAt(0) ?? 0;
  if (cp < 0x80) return 1;
  if (cp < 0x800) return 2;
  if (cp < 0x10000) return 3;
  return 4;
}

/**
 * Folds a content line so no physical line exceeds 75 octets (RFC 5545 §3.1).
 * Continuation lines start with a single space. Never splits a UTF-8 character.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  let limit = MAX_LINE_OCTETS;
  for (const char of line) {
    const size = utf8Length(char);
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
      limit = MAX_LINE_OCTETS - 1; // the leading space counts
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** UTC DATE-TIME, e.g. 20261120T003000Z. */
export function formatIcsDate(at: Date | string): string {
  const iso = (typeof at === "string" ? new Date(at) : at).toISOString();
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** What the calendar feed knows about a Session's history (from published Schedule Changes). */
export interface SessionRevision {
  /** Number of published Schedule Changes for the Session. */
  sequence: number;
  lastModified: Date;
}

export interface CalendarInput {
  name: string;
  description: string;
  entries: SessionWithContext[];
  revisions: ReadonlyMap<string, SessionRevision>;
  now: Date;
}

export function seriesPageUrl(series: string): string {
  return `${SITE_ORIGIN}/${series}`;
}

function eventLines({ session, round, circuit }: SessionWithContext, revision: SessionRevision | undefined, now: Date) {
  const series = SERIES[session.series];
  const cancelled = session.status === "cancelled";
  const pageUrl = seriesPageUrl(session.series);
  const summary = `${series.shortName} · ${round.name} · ${session.name}${cancelled ? " (cancelled)" : ""}`;
  const notes = [
    cancelled ? "This Session has been cancelled." : null,
    !round.sessionTimesConfirmed ? "Session times are not confirmed yet." : null,
    session.endIsEstimated ? "The end time is an estimate." : null,
    `Session times and weather: ${pageUrl}`,
  ].filter((n): n is string => n !== null);
  const status = cancelled ? "CANCELLED" : round.sessionTimesConfirmed ? "CONFIRMED" : "TENTATIVE";

  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeText(`${session.id}@${UID_DOMAIN}`)}`,
    `DTSTAMP:${formatIcsDate(now)}`,
    `DTSTART:${formatIcsDate(session.startsAt)}`,
    `DTEND:${formatIcsDate(session.endsAt)}`,
    `SUMMARY:${escapeText(summary)}`,
    `LOCATION:${escapeText(`${circuit.name}, ${circuit.location}`)}`,
    `DESCRIPTION:${escapeText(notes.join("\n"))}`,
    `URL:${pageUrl}`,
    `CATEGORIES:${escapeText(series.shortName)}`,
    `STATUS:${status}`,
    `SEQUENCE:${revision?.sequence ?? 0}`,
  ];
  if (revision) lines.push(`LAST-MODIFIED:${formatIcsDate(revision.lastModified)}`);
  lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  return lines;
}

/** A complete VCALENDAR document with CRLF line endings, one VEVENT per Session. */
export function buildCalendar({ name, description, entries, revisions, now }: CalendarInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//motorsportsinfo.app//Calendar feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `NAME:${escapeText(name)}`,
    `X-WR-CALNAME:${escapeText(name)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `X-WR-CALDESC:${escapeText(description)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...entries.flatMap((entry) => eventLines(entry, revisions.get(entry.session.id), now)),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
