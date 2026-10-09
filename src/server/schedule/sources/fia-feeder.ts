// F2 and F3 primary source: the official Round pages on fiaformula2.com / fiaformula3.com.
// The season page links every Round (/en/racing/<year>/<slug>) on a card that shows "ROUND n".
// Each Round page is a Next.js page whose flight data (self.__next_f.push string chunks) holds a
// race object: { meetingSessions: [{ shortName, sessionType, startTime, endTime, gmtOffset, state,
// sessionStatus? }], meetingStartDate, meetingEndDate, circuitShortName, meetingLocation, ... }.
// Session times are local with a separate offset. Unconfirmed Sessions carry sessionStatus "TBC"
// with placeholder times.
import * as cheerio from "cheerio";
import type { SessionType } from "@/domain/types";
import { localWithOffsetToIso } from "../time";
import { getPage, type SourceContext } from "./http";
import type { RawRound, RawSession } from "../types";

export type FeederSeries = "f2" | "f3";

export const FEEDER_SITES: Record<FeederSeries, string> = {
  f2: "https://www.fiaformula2.com",
  f3: "https://www.fiaformula3.com",
};

export interface FiaMeetingSession {
  session?: string;
  shortName?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  gmtOffset?: string;
  sessionType?: string;
  sessionNumber?: number;
  state?: string;
  sessionStatus?: string;
}

export interface FiaRace {
  meetingSessions: FiaMeetingSession[];
  season?: number;
  meetingName?: string;
  meetingStartDate?: string;
  meetingEndDate?: string;
  meetingLocation?: string;
  circuitShortName?: string;
  circuitOfficialName?: string;
  meetingCountryName?: string;
}

export interface FiaSeasonEntry {
  slug: string;
  roundNumber: number | null;
}

/** Concatenates the Next.js flight data string chunks embedded in the page (unescaping them). */
export function extractFlightData(html: string): string {
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let out = "";
  for (let m = re.exec(html); m; m = re.exec(html)) {
    try {
      out += JSON.parse(m[1]) as string;
    } catch {
      // A chunk that isn't a plain JSON string literal is not schedule data.
    }
  }
  return out;
}

/** Returns the balanced JSON object or array starting at `start` (which must be "{" or "["). */
export function sliceBalancedJson(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Finds the race object in a Round page. Throws if the page has no schedule data (layout changed). */
export function extractFiaRace(html: string): FiaRace {
  const flight = extractFlightData(html);
  const objectStart = flight.indexOf('{"meetingSessions":[');
  if (objectStart >= 0) {
    const json = sliceBalancedJson(flight, objectStart);
    if (json) return JSON.parse(json) as FiaRace;
  }
  const arrayMarker = flight.indexOf('"meetingSessions":[');
  if (arrayMarker >= 0) {
    const json = sliceBalancedJson(flight, arrayMarker + '"meetingSessions":'.length);
    if (json) return { meetingSessions: JSON.parse(json) as FiaMeetingSession[] };
  }
  throw new Error("No meetingSessions in page flight data");
}

export function fiaSessionType(s: FiaMeetingSession): SessionType | null {
  const kind = (s.sessionType ?? s.description ?? "").toLowerCase();
  const label = `${s.shortName ?? ""} ${s.session ?? ""}`.toLowerCase();
  if (kind === "practice" || /practice/.test(label)) return "practice";
  if (kind === "qualifying" || /qualifying/.test(label)) return "qualifying";
  if (/sprint/.test(label)) return "sprint-race";
  if (/feature/.test(label)) return "feature-race";
  return null;
}

const isTbc = (s: FiaMeetingSession) => /tbc|tba|to be confirmed/i.test(s.sessionStatus ?? "");
const isCancelled = (s: FiaMeetingSession) => /cancel/i.test(`${s.sessionStatus ?? ""} ${s.state ?? ""}`);

export function parseFiaRoundPage(
  html: string,
  info: { season: number; slug: string; roundNumber: number | null; url: string },
): RawRound {
  const race = extractFiaRace(html);
  const sessions: RawSession[] = [];
  let unreadable = false;
  for (const s of race.meetingSessions) {
    const name = s.shortName ?? s.session ?? s.description ?? "Session";
    const startsAt = s.startTime && s.gmtOffset ? localWithOffsetToIso(s.startTime, s.gmtOffset) : null;
    if (!startsAt) {
      unreadable = true;
      continue;
    }
    const endsAt = s.endTime && s.gmtOffset ? localWithOffsetToIso(s.endTime, s.gmtOffset) : null;
    sessions.push({ key: name, name, type: fiaSessionType(s), startsAt, endsAt, cancelled: isCancelled(s) });
  }
  const timesConfirmed = sessions.length > 0 && !unreadable && !race.meetingSessions.some(isTbc);
  const location = race.meetingLocation ?? race.circuitShortName ?? info.slug;
  return {
    season: race.season ?? info.season,
    name: info.roundNumber ? `Round ${info.roundNumber}` : location,
    circuitHints: [info.slug, race.circuitShortName, race.meetingLocation, race.circuitOfficialName].filter(
      (h): h is string => !!h,
    ),
    timesConfirmed,
    sessions: timesConfirmed ? sessions : [],
    startDate: race.meetingStartDate ?? null,
    endDate: race.meetingEndDate ?? null,
    sourceRef: info.url,
  };
}

/** Round slugs and numbers, in calendar order, from the season page cards. */
export function parseFiaSeasonPage(html: string, year: number): FiaSeasonEntry[] {
  const $ = cheerio.load(html);
  const prefix = `/en/racing/${year}/`;
  const entries = new Map<string, number | null>();
  $(`a[href^="${prefix}"]`).each((_, a) => {
    const href = ($(a).attr("href") ?? "").split(/[?#]/)[0];
    const slug = href.slice(prefix.length).replace(/\/+$/, "");
    if (!/^[a-z0-9-]+$/.test(slug)) return;
    // Climb to the smallest ancestor holding a "ROUND n" label; stop if it holds several (a whole grid).
    let roundNumber: number | null = null;
    let el = $(a).parent();
    for (let depth = 0; depth < 8 && el.length; depth++, el = el.parent()) {
      const labels = el
        .find("*")
        .filter((__, node) => $(node).children().length === 0)
        .map((__, node) => /^round\s+(\d+)$/i.exec($(node).text().trim())?.[1])
        .get()
        .filter(Boolean);
      if (labels.length === 1) roundNumber = Number(labels[0]);
      if (labels.length > 0) break;
    }
    if (!entries.has(slug) || (entries.get(slug) === null && roundNumber !== null)) entries.set(slug, roundNumber);
  });
  const list = [...entries].map(([slug, roundNumber]) => ({ slug, roundNumber }));
  return list.sort((a, b) => (a.roundNumber ?? 999) - (b.roundNumber ?? 999));
}

/**
 * Fetches one season: the season page, then each Round page sequentially with a small delay.
 * Throws when the season page fails or lists nothing. A single Round page failing is a warning,
 * and the season is then not "complete" (so nothing is treated as having disappeared).
 */
export async function fetchFiaFeederSeason(
  ctx: SourceContext,
  series: FeederSeries,
  year: number,
): Promise<{ rounds: RawRound[]; complete: boolean; warnings: string[] }> {
  const site = FEEDER_SITES[series];
  const seasonHtml = await getPage(ctx, `${site}/en/racing/${year}`);
  const entries = parseFiaSeasonPage(seasonHtml, year);
  if (entries.length === 0) throw new Error(`No Rounds listed on ${site}/en/racing/${year}`);

  const rounds: RawRound[] = [];
  const warnings: string[] = [];
  for (const entry of entries) {
    await ctx.sleep(300);
    const url = `${site}/en/racing/${year}/${entry.slug}`;
    try {
      rounds.push(parseFiaRoundPage(await getPage(ctx, url), { season: year, ...entry, url }));
    } catch (error) {
      warnings.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (rounds.length === 0) throw new Error(`Every Round page failed for ${site} ${year}: ${warnings.join("; ")}`);
  return { rounds, complete: warnings.length === 0, warnings };
}
