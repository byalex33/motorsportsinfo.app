// GT World Challenge Europe: the official site, gt-world-challenge-europe.com (SRO), which answers ordinary
// requests. Its calendar page lists one season's events (the current one until SRO moves it on to next
// season, which can happen before 1 January), each linking an event page
// (/event/<id>/<slug>) whose title carries the dates ("Barcelona, Spain, 1 - 4 October 2026 | …") and whose
// timetable lists every Session per day with its local and GMT start. No end times are given, so every
// Session end is estimated. Test days (listed without a "Round N") are not Rounds; paid tests, Bronze tests,
// pit walks, parades and classification checkpoints are not Sessions. An event page with no timetable yet
// is "Times TBC".
import * as cheerio from "cheerio";
import type { SessionType } from "@/domain/types";
import { isoDate, monthNumber } from "./dates";
import { getPage, type SourceContext } from "./http";
import type { RawRound, RawSession } from "../types";

const SITE = "https://www.gt-world-challenge-europe.com";

/** A Round as listed on the calendar page. */
export interface GtwcEventLink {
  /** Site path, e.g. "/event/254/barcelona". */
  path: string;
  season: number;
  roundNumber: number;
  name: string;
}

export function gtwcSessionType(name: string): SessionType | null {
  const n = name.toLowerCase();
  if (/superpole|qualifying/.test(n)) return "qualifying";
  if (/practice|warm[\s-]?up/.test(n)) return "practice";
  if (/\brace\b/.test(n)) return "race";
  return null;
}

/**
 * Dropped rather than flagged: tests, off-track items, and classification checkpoints the timetable lists
 * as rows ("Qualifying 1 Combined", "Main Race after 1h 30").
 */
function isDropped(name: string): boolean {
  return /\btest\b|pit walk|parade|autograph|track walk|\bcombined\b|\bafter\s+\d/i.test(name);
}

function text(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** "CrowdStrike 24 Hours of Spa" → "24 Hours of Spa"; other names are kept. */
function roundName(name: string): string {
  return /\b\d+\s+hours\s+of\s+.+$/i.exec(name)?.[0] ?? name;
}

/** Every Round on the calendar page (past and upcoming), in page order. */
export function parseGtwcCalendar(html: string): GtwcEventLink[] {
  const $ = cheerio.load(html);
  const events: GtwcEventLink[] = [];
  $('a[href^="/event/"]').each((_, a) => {
    if (!/event info/i.test($(a).text())) return;
    const path = ($(a).attr("href") ?? "").split(/[?#]/)[0];
    const item = $(a).closest("li.past-events__list-item, li.calendar__list-item");
    const itemText = text(item.text());
    const round = /\bRound (\d+)\b/.exec(itemText);
    const year = /\b(20\d{2})\b/.exec(itemText);
    const name = text(item.find("strong, .calendar__race-header").first().text());
    if (!round || !year || !name || events.some((e) => e.path === path)) return;
    events.push({ path, season: Number(year[1]), roundNumber: Number(round[1]), name });
  });
  return events;
}

/** "Barcelona, Spain, 1 - 4 October 2026", "Magny-Cours, France, 30 July - 1 August 2026" → Track Time dates. */
export function parseGtwcTitleDates(title: string): { startDate: string; endDate: string } | null {
  const m = /(\d{1,2})(?:\s+([a-z]+))?(?:\s+(\d{4}))?\s*-\s*(\d{1,2})\s+([a-z]+)\s+(\d{4})/i.exec(title);
  if (!m) return null;
  const endMonth = monthNumber(m[5]);
  const startMonth = m[2] ? monthNumber(m[2]) : endMonth;
  if (!endMonth || !startMonth) return null;
  const endYear = Number(m[6]);
  return {
    startDate: isoDate(m[3] ? Number(m[3]) : endYear, startMonth, Number(m[1])),
    endDate: isoDate(endYear, endMonth, Number(m[4])),
  };
}

/** "HH:MM" → minutes since midnight. */
function clock(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * A Session's UTC start from its day ("Friday, 2 October"), local start and GMT start. The day is the local
 * date; the local and GMT columns give the offset, so a start just after local midnight lands on the right
 * UTC day.
 */
export function gtwcStart(day: string, local: string, gmt: string, season: number): string | null {
  const d = /(\d{1,2})\s+([a-z]+)/i.exec(day);
  const month = d ? monthNumber(d[2]) : null;
  const localMinutes = clock(local);
  const gmtMinutes = clock(gmt);
  if (!d || !month || localMinutes === null || gmtMinutes === null) return null;
  let offset = localMinutes - gmtMinutes;
  if (offset > 14 * 60) offset -= 24 * 60;
  if (offset < -12 * 60) offset += 24 * 60;
  return new Date(Date.UTC(season, month - 1, Number(d[1])) + (localMinutes - offset) * 60_000).toISOString();
}

export function parseGtwcEventPage(html: string, event: GtwcEventLink, url: string): RawRound {
  const $ = cheerio.load(html);
  const dates = parseGtwcTitleDates($("title").first().text());

  const sessions: RawSession[] = [];
  const seen = new Set<string>();
  $("table.timetable__table").each((_, table) => {
    const day = text($(table).find("caption").first().text());
    $(table)
      .find("tbody tr")
      .each((__, row) => {
        const cells = $(row)
          .find("td")
          .toArray()
          .map((td) => text($(td).text()));
        if (cells.length < 3 || !cells[0] || isDropped(cells[0])) return;
        const startsAt = gtwcStart(day, cells[1], cells[2], event.season);
        if (!startsAt) return;
        const name = cells[0];
        // The page lists some Sessions twice (desktop and mobile tables).
        if (seen.has(`${name}|${startsAt}`)) return;
        seen.add(`${name}|${startsAt}`);
        sessions.push({ key: name, name, type: gtwcSessionType(name), startsAt, endsAt: null, cancelled: false });
      });
  });

  // Sprint Cup qualifying is run in groups ("Qualifying 1 - Group A"), listed after a "Qualifying 1" heading
  // row; keep the groups, which are the Sessions on track.
  const grouped = new Set(sessions.map((s) => /^(.+?)\s*-\s*group\b/i.exec(s.name)?.[1].toLowerCase()).filter(Boolean));
  const kept = sessions.filter((s) => !grouped.has(s.name.toLowerCase()));

  const timesConfirmed = kept.some((s) => s.type === "race");
  return {
    season: event.season,
    name: roundName(event.name),
    circuitHints: [event.name, decodeURIComponent(event.path.split("/").at(-1) ?? "")],
    timesConfirmed,
    sessions: kept,
    // The title's dates include test days; with Session times the Round's dates come from those.
    startDate: timesConfirmed ? null : (dates?.startDate ?? null),
    endDate: timesConfirmed ? null : (dates?.endDate ?? null),
    sourceRef: url,
  };
}

/** The calendar page, read once per check: it lists one season, which switches to the next some time before 1 January. */
export async function fetchGtwcCalendar(ctx: SourceContext): Promise<GtwcEventLink[]> {
  return parseGtwcCalendar(await getPage(ctx, `${SITE}/calendar`));
}

/** `year`'s Rounds from the calendar's event pages; a season the calendar does not list is an empty list. */
export async function fetchGtwcSeason(
  ctx: SourceContext,
  calendar: GtwcEventLink[],
  year: number,
): Promise<{ rounds: RawRound[]; complete: boolean; warnings: string[] }> {
  const events = calendar.filter((e) => e.season === year);
  const rounds: RawRound[] = [];
  const warnings: string[] = [];
  for (const event of events) {
    await ctx.sleep(300);
    const url = `${SITE}${encodeURI(decodeURI(event.path))}`;
    try {
      rounds.push(parseGtwcEventPage(await getPage(ctx, url), event, url));
    } catch (error) {
      warnings.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (events.length > 0 && rounds.length === 0) throw new Error(`Every event page failed: ${warnings.join("; ")}`);
  return { rounds, complete: warnings.length === 0, warnings };
}
