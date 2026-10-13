// WRC: wrc.com's content API (the JSON its own pages load from /v3/api/graphql). Plain requests are served;
// requests posing as a browser are refused. Per season it lists each rally (an "event profile") with its
// start and end in local time. A rally's Itinerary tab is an editor-written list, one entry per day:
//   "Friday, 11 September" → "08:53: SS1 Turquía 1 (22.94 km)", …, "13:15: WOLF POWER STAGE - SS16 BioBío 2"
// with the time zone in its title ("All Times UTC -3"). The day headings are loosely typed ("Saturday, April
// 202611", "Wednesday, 06.05."), so each day's date comes from its weekday within the rally's dates.
// Each rally becomes Shakedown, one Session per day of stages (from its first stage to its last plus
// STAGE_DAY_TAIL_MINUTES) and the Power Stage. Until the itinerary is published the Round is "Times TBC".
// The Circuit is the rally's service park (WRC_SERVICE_PARKS); a rally not listed there is flagged.
import { errorMessage, getJson, type SourceContext } from "./http";
import { addDays } from "../time";
import type { RawRound, RawSession } from "../types";

const API = "https://www.wrc.com/v3/api/graphql/v1/v3";

/** A day's Session ends this long after its last stage starts: roughly the field's run through it. */
export const STAGE_DAY_TAIL_MINUTES = 75;

/** Rally title → service park Circuit id. Update when a rally moves its service park. */
export const WRC_SERVICE_PARKS: [RegExp, string][] = [
  [/monte.?carlo/i, "gap"],
  [/sweden/i, "umea"],
  [/safari|kenya/i, "naivasha"],
  [/croatia/i, "grobnik"],
  [/canarias/i, "gran-canaria"],
  [/portugal/i, "matosinhos"],
  [/japan/i, "toyota-stadium"],
  [/acropolis|greece/i, "loutraki"],
  [/estonia/i, "tartu"],
  [/finland/i, "jyvaskyla"],
  [/paraguay/i, "encarnacion"],
  [/chile/i, "concepcion"],
  // Sardinia's "Rally Italia Sardegna" first: from 2027 the Italian round is "Rally d'Italia", based in Rome.
  [/sardegna/i, "alghero"],
  [/italia/i, "rome"],
  [/scotland/i, "aberdeen"],
  [/rally us\b|united states/i, "knoxville"],
  [/saudi/i, "jeddah-service-park"],
];

export interface WrcEvent {
  reference: { uriSlug: string; isWRC?: boolean };
  content: { title: string };
  /** Local times with offsets, e.g. "2026-09-10T08:45:00-03:00". */
  event: { startDate: string; endDate: string };
  status?: string;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** "WRC Rally Chile Biobío 2026" → "Rally Chile Biobío". */
export function wrcRoundName(title: string): string {
  return title.replace(/^WRC\s+/i, "").replace(/\s+\d{4}$/, "").trim();
}

export function wrcServicePark(title: string): string | null {
  return WRC_SERVICE_PARKS.find(([pattern]) => pattern.test(title))?.[1] ?? null;
}

/** Minutes east of UTC from "All Times UTC -3" / "UTC+9" / "UTC +5:30", or null. */
export function parseUtcOffset(text: string): number | null {
  const m = /UTC\s*([+\-−])\s*(\d{1,2})(?::?(\d{2}))?/i.exec(text);
  if (!m) return null;
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "+" ? minutes : -minutes;
}

/** Minutes east of UTC of an ISO time with an offset ("…-03:00" → -180). */
function isoOffset(iso: string): number {
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(iso);
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "+" ? minutes : -minutes;
}

/** The local calendar date (YYYY-MM-DD) of an ISO time with an offset. */
function localDate(iso: string): string {
  return iso.slice(0, 10);
}

/** The date with this weekday from three days before the rally starts to a day after it ends, or null. */
function dateForWeekday(heading: string, startDate: string, endDate: string): string | null {
  const weekday = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`, "i").test(heading));
  if (weekday < 0) return null;
  for (let d = addDays(startDate, -3); d <= addDays(endDate, 1); d = addDays(d, 1)) {
    if (new Date(`${d}T00:00:00Z`).getUTCDay() === weekday) return d;
  }
  return null;
}

/** Local date + "HH:MM" at `offset` minutes east of UTC → ISO UTC. */
function toUtc(date: string, hours: number, minutes: number, offset: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hours, minutes) - offset * 60_000).toISOString();
}

// --- Itinerary JSON -------------------------------------------------------------------------------

type Json = unknown;

function texts(node: Json): string[] {
  if (Array.isArray(node)) return node.flatMap(texts);
  if (node && typeof node === "object") {
    const record = node as Record<string, Json>;
    const own = typeof record.text === "string" ? [record.text] : [];
    return [...own, ...Object.entries(record).flatMap(([k, v]) => (k === "text" ? [] : texts(v)))];
  }
  return [];
}

function findAll(node: Json, match: (n: Record<string, Json>) => boolean, out: Record<string, Json>[] = []): Record<string, Json>[] {
  if (Array.isArray(node)) for (const n of node) findAll(n, match, out);
  else if (node && typeof node === "object") {
    const record = node as Record<string, Json>;
    if (match(record)) out.push(record);
    for (const v of Object.values(record)) findAll(v, match, out);
  }
  return out;
}

export interface ItineraryDay {
  heading: string;
  items: string[];
}

/** The itinerary's days and its "All Times UTC …" title, or null when it isn't published yet. */
export function readItinerary(json: Json): { title: string; days: ItineraryDay[] } | null {
  const faq = findAll(json, (n) => n.type === "faq")[0];
  if (!faq || !Array.isArray(faq.elements)) return null;
  const days = (faq.elements as Record<string, Json>[]).map((el) => ({
    heading: texts(el.question).join(" ").replace(/\s+/g, " ").trim(),
    items: findAll(el.answer, (n) => "label" in n && Array.isArray(n.elements)).map((item) =>
      texts(item.elements).join(" ").replace(/\s+/g, " ").trim(),
    ),
  }));
  return days.length > 0 ? { title: typeof faq.title === "string" ? faq.title : "", days } : null;
}

// --- Itinerary → Sessions -------------------------------------------------------------------------

interface Timed {
  date: string;
  hours: number;
  minutes: number;
  text: string;
}

const STAGE = /\bS{2,3}\s*(\d+)\b/i;
const POWER_STAGE = /power\s*-?\s*stage/i;

/**
 * Turns an itinerary into Shakedown, "Day n (SSa–SSb)" and "Power Stage (SSn)" Sessions.
 * `offset` is the itinerary's UTC offset in minutes; entries without a time are skipped with a warning.
 */
export function itinerarySessions(
  itinerary: { days: ItineraryDay[] },
  event: { startDate: string; endDate: string },
  offset: number,
  warn: (message: string) => void,
): RawSession[] {
  const start = localDate(event.startDate);
  const end = localDate(event.endDate);
  const byDay: Timed[][] = [];
  for (const day of itinerary.days) {
    const date = dateForWeekday(day.heading, start, end);
    if (!date) {
      warn(`no weekday in itinerary day "${day.heading}"`);
      continue;
    }
    const timed: Timed[] = [];
    for (const item of day.items) {
      const m = /^(\d{1,2})[:.h](\d{2})\s*:?\s*(.*)$/.exec(item);
      if (!m) {
        if (/shakedown|\bS{2,3}\s*\d/i.test(item)) warn(`no time for "${item}"`);
        continue;
      }
      timed.push({ date, hours: Number(m[1]), minutes: Number(m[2]), text: m[3] });
    }
    byDay.push(timed);
  }

  const at = (t: Timed) => toUtc(t.date, t.hours, t.minutes, offset);
  const stageNumber = (t: Timed) => STAGE.exec(t.text)?.[1];
  const sessions: RawSession[] = [];

  const shakedown = byDay.flat().find((t) => /shakedown/i.test(t.text));
  if (shakedown) sessions.push(session("Shakedown", "Shakedown", "shakedown", at(shakedown), null));

  let dayNumber = 0;
  for (const timed of byDay) {
    const stages = timed.filter((t) => stageNumber(t) && !POWER_STAGE.test(t.text));
    if (stages.length === 0) continue;
    dayNumber += 1;
    const first = stageNumber(stages[0]);
    const last = stageNumber(stages.at(-1)!);
    const range = first === last ? `SS${first}` : `SS${first}–SS${last}`;
    const startsAt = at(stages[0]);
    const lastStart = Date.parse(at(stages.at(-1)!));
    const endsAt = new Date(lastStart + STAGE_DAY_TAIL_MINUTES * 60_000).toISOString();
    sessions.push({ ...session(`Day ${dayNumber}`, `Day ${dayNumber} (${range})`, "stages", startsAt, endsAt), endIsEstimated: true });
  }

  const power = byDay.flat().find((t) => POWER_STAGE.test(t.text));
  if (power) {
    const n = stageNumber(power);
    sessions.push(session("Power Stage", n ? `Power Stage (SS${n})` : "Power Stage", "power-stage", at(power), null));
  }
  return sessions;
}

function session(key: string, name: string, type: RawSession["type"], startsAt: string, endsAt: string | null): RawSession {
  return { key, name, type, startsAt, endsAt, cancelled: false };
}

/** One rally as a Round, from its event profile and (when published) its itinerary JSON. */
export function parseWrcRally(event: WrcEvent, itineraryJson: Json | null, season: number, warnings: string[]): RawRound {
  const title = event.content.title;
  const sourceRef = `wrc.com ${event.reference.uriSlug}`;
  const warn = (message: string) => warnings.push(`${sourceRef}: ${message}`);
  const itinerary = itineraryJson ? readItinerary(itineraryJson) : null;
  const offset = (itinerary && parseUtcOffset(itinerary.title)) ?? isoOffset(event.event.startDate);
  const sessions = itinerary ? itinerarySessions(itinerary, event.event, offset, warn) : [];
  const timesConfirmed = sessions.some((s) => s.type === "stages");
  const circuitId = wrcServicePark(title);
  return {
    season,
    name: wrcRoundName(title),
    circuitHints: [title],
    circuitId,
    timesConfirmed,
    sessions: timesConfirmed ? sessions : [],
    startDate: localDate(event.event.startDate),
    endDate: localDate(event.event.endDate),
    sourceRef,
  };
}

// --- Fetching -------------------------------------------------------------------------------------

export function wrcSeasonUrl(year: number): string {
  return `${API}/feed/en-INT?filter[type]=event-profiles&filter[startDate][gte]=${year}-01-01&filter[startDate][lt]=${year + 1}-01-01&sort=startDate&page[limit]=50&rb3Locale=en&rb3Schema=v1:cardList`;
}

function tabsUrl(slug: string): string {
  return `${API}/query/en-INT?filter[type]=event-profiles&filter[uriSlug]=${slug}&rb3PageTabsBaseUrl=/en/events/${slug}/&rb3Locale=en&rb3Schema=v1:pageTabs`;
}

function detailsUrl(slug: string): string {
  return `${API}/feed/en-INT?disableUsageRestrictions=true&filter[type]=event-details&filter[uriSlug]=${slug}&page[limit]=1&rb3Locale=en&rb3Schema=v1:inlineContent`;
}

/** The Itinerary tab's page slug, or null (no tab yet, or it now points at the results). */
export function itinerarySlug(tabs: { data?: { tabs?: { label: string; url: string }[] } }): string | null {
  const tab = tabs.data?.tabs?.find((t) => /^itiner/i.test(t.label.trim()));
  const slug = tab?.url.replace(/\/+$/, "").split("/").at(-1);
  return slug && !/result/i.test(slug) ? slug : null;
}

/**
 * Every WRC rally starting in `year`, with its itinerary where wrc.com has one. After a rally the Itinerary
 * tab may turn into the results, so a finished rally can read as "Times TBC" again; only its Round row
 * changes, its Sessions stay (diff.ts never removes Sessions that have ended).
 */
export async function fetchWrcSeason(ctx: SourceContext, year: number): Promise<{ rounds: RawRound[]; warnings: string[] }> {
  const feed = await getJson<{ data?: WrcEvent[] }>(ctx, wrcSeasonUrl(year));
  const events = (feed.data ?? []).filter((e) => e.reference.isWRC !== false && e.reference.uriSlug.startsWith("wrc-"));
  const warnings: string[] = [];
  const rounds: RawRound[] = [];
  for (const event of events) {
    if (/cancel/i.test(event.status ?? "")) {
      warnings.push(`wrc.com ${event.reference.uriSlug} is ${event.status}; skipped`);
      continue;
    }
    let itinerary: Json | null = null;
    try {
      await ctx.sleep(300);
      const slug = itinerarySlug(await getJson(ctx, tabsUrl(event.reference.uriSlug)));
      if (slug) {
        await ctx.sleep(300);
        itinerary = await getJson(ctx, detailsUrl(slug));
      }
    } catch (error) {
      warnings.push(`wrc.com ${event.reference.uriSlug} itinerary failed: ${errorMessage(error)}`);
    }
    rounds.push(parseWrcRally(event, itinerary, year, warnings));
  }
  return { rounds, warnings };
}
