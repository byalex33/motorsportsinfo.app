// DTM: the JSON API dtm.com's own pages read (api.dtm.com/data), which answers ordinary requests.
// `query=events` lists every event with its season ("DTM 2026"), Round number and racetrack;
// `query=eventDetails&slug=…` adds the weekend timetable with UTC start and end times. The timetable covers
// the support races and fan programme too: only entries tagged `raceSeries: "DTM"` are DTM Sessions (the
// DTM "Track-Safari" is untagged, so it drops out). An event with no DTM entries yet is "Times TBC", dated
// from the event's own start and end.
import type { SessionType } from "@/domain/types";
import { getCircuitTimeZoneDate } from "./dates";
import { getJson, type SourceContext } from "./http";
import type { RawRound, RawSession } from "../types";

const API = "https://api.dtm.com/data";

export interface DtmEvent {
  name: string;
  slug: string;
  /** ISO 8601 with offset. */
  startTime: string;
  endTime: string;
  eventNumber: number | null;
  /** "DTM 2026", or "Ended" for old seasons. */
  eventCategory: string | null;
  special: boolean | null;
  racetrack: { name: string } | null;
  raceSeries: string[] | null;
}

export interface DtmTimetableEntry {
  start: string;
  end: string | null;
  headline: string | null;
  label: string | null;
  raceSeries: string | null;
}

export interface DtmEventDetails {
  events: (DtmEvent & { timetable?: DtmTimetableEntry[] | null })[];
}

/** "Free practice 1" → "Free Practice 1"; "Qualiyfing 2" (sic, Sachsenring 2026) → "Qualifying 2". */
export function dtmSessionName(label: string): string {
  return label
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bqualiyfing\b/gi, "Qualifying")
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function dtmSessionType(label: string): SessionType | null {
  const n = label.toLowerCase();
  if (/qualifying/.test(n)) return "qualifying";
  if (/practice|training|warm[\s-]?up/.test(n)) return "practice";
  if (/\brace\b|rennen/.test(n)) return "race";
  return null;
}

/** The season's championship events, in Round order. */
export function dtmSeasonEvents(events: DtmEvent[], season: number): DtmEvent[] {
  return events
    .filter(
      (e) =>
        (e.raceSeries ?? []).includes("DTM") &&
        !e.special &&
        (e.eventCategory === `DTM ${season}` || e.slug.endsWith(`-${season}`)),
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function parseDtmEvent(event: DtmEvent, timetable: DtmTimetableEntry[], season: number, sourceRef: string): RawRound {
  const sessions: RawSession[] = timetable
    .filter((t) => t.raceSeries === "DTM" && t.label)
    .map((t) => {
      const name = dtmSessionName(t.label!);
      return { key: name, name, type: dtmSessionType(name), startsAt: t.start, endsAt: t.end, cancelled: false };
    });
  const circuitHints = [event.racetrack?.name ?? "", event.name, event.slug.replace(new RegExp(`-${season}$`), "")];
  return {
    season,
    // "Red Bull Ring by VKB-Bank" → "Red Bull Ring".
    name: event.name.replace(/\s+by\s+.+$/i, "").trim(),
    circuitHints,
    timesConfirmed: sessions.some((s) => s.type === "race"),
    sessions,
    startDate: getCircuitTimeZoneDate(circuitHints, event.startTime),
    endDate: getCircuitTimeZoneDate(circuitHints, event.endTime),
    sourceRef,
  };
}

/** The event list, read once per check: it covers every season. */
export async function fetchDtmEvents(ctx: SourceContext): Promise<DtmEvent[]> {
  return (await getJson<{ events: DtmEvent[] }>(ctx, `${API}?query=events&lang=en`)).events;
}

export async function fetchDtmSeason(
  ctx: SourceContext,
  events: DtmEvent[],
  year: number,
): Promise<{ rounds: RawRound[]; complete: boolean; warnings: string[] }> {
  const rounds: RawRound[] = [];
  const warnings: string[] = [];
  const season = dtmSeasonEvents(events, year);
  for (const event of season) {
    await ctx.sleep(300);
    const url = `${API}?query=eventDetails&slug=${encodeURIComponent(event.slug)}&lang=en`;
    try {
      const details = await getJson<DtmEventDetails>(ctx, url);
      rounds.push(parseDtmEvent(event, details.events[0]?.timetable ?? [], year, url));
    } catch (error) {
      warnings.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (season.length > 0 && rounds.length === 0) throw new Error(`Every event detail failed: ${warnings.join("; ")}`);
  return { rounds, complete: warnings.length === 0, warnings };
}
