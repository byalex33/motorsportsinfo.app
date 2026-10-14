// Super GT: the official site, supergt.net (WordPress), which answers ordinary requests. The Japanese
// calendar page (/calendar?series=<year>) lists each Round with its month, days and race page; the English
// pages are not used because their race pages leave the timetable empty and their calendar links a
// relocated Round to its old page. Each race page's timetable has one block per day (dated by its tab,
// "2026-10-17") with entries carrying local start and end times (data-from / data-to, JST, which has no
// daylight saving). Only "SUPER GT : …" entries are Super GT Sessions; the Circuit Safari is a fan ride, not a
// Session. A race listed by laps has no end time. A race page with no Super GT entries yet is "Times TBC".
//
// Rounds are named "Round 7": Super GT keeps its official numbers when a Round moves (in 2026 Round 3 ran at
// Motegi in November, after Round 7), and the site numbers a Round by its name (select.ts).
import * as cheerio from "cheerio";
import type { SessionType } from "@/domain/types";
import { isoDate } from "./dates";
import { getPage, type SourceContext } from "./http";
import type { RawRound, RawSession } from "../types";

const SITE = "https://supergt.net";
/** Japan Standard Time, UTC+9 all year. */
const JST_OFFSET_MINUTES = 9 * 60;

export interface SuperGtRoundLink {
  url: string;
  roundNumber: number;
  /** The place in the Round label, "AUTOPOLIS" in "Round7 AUTOPOLIS". */
  place: string;
  startDate: string;
  endDate: string;
}

/** Super GT's Japanese Session names → an English name and Session Type, or null for a non-Session. */
export function superGtSession(label: string): { name: string; type: SessionType | null } | null {
  const n = label.normalize("NFKC").replace(/\s+/g, "");
  if (/サファリ|ウォーク|ピット|パレード|セレモニー/.test(n)) return null;
  const q = /予選.*?Q(\d)/i.exec(n);
  if (q) return { name: `Qualifying ${q[1]}`, type: "qualifying" };
  if (/予選/.test(n)) return { name: "Qualifying", type: "qualifying" };
  if (/ウォームアップ/.test(n)) return { name: "Warm-up", type: "practice" };
  if (/決勝/.test(n)) return { name: "Race", type: "race" };
  if (/練習|専有走行|占有走行|フリー走行/.test(n)) return { name: "Practice", type: "practice" };
  return { name: label.trim(), type: null };
}

/** The season's Rounds from the calendar table, in page order. */
export function parseSuperGtCalendar(html: string, season: number): SuperGtRoundLink[] {
  const $ = cheerio.load(html);
  const rounds: SuperGtRoundLink[] = [];
  $("tr").each((_, row) => {
    const link = $(row).find('a[href*="/races/"]').first();
    const label = /Round\s*(\d+)\s+(.+)/i.exec(link.text().replace(/\s+/g, " ").trim());
    const month = Number($(row).find(".numerator_s").first().text().trim());
    const days = /(\d{1,2})\s*-\s*(\d{1,2})/.exec($(row).find(".denominator_s").first().text());
    if (!label || !month || !days) return;
    const startDay = Number(days[1]);
    const endDay = Number(days[2]);
    const startDate = isoDate(season, month, startDay);
    // "30-01" runs into the next month.
    const endDate =
      endDay >= startDay ? isoDate(season, month, endDay) : new Date(Date.UTC(season, month, endDay)).toISOString().slice(0, 10);
    const url = new URL(link.attr("href")!, SITE).toString();
    if (rounds.some((r) => r.url === url)) return;
    rounds.push({ url, roundNumber: Number(label[1]), place: label[2].trim(), startDate, endDate });
  });
  return rounds;
}

/** A local JST date and "HH:MM" → ISO UTC. */
function jst(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!d || !t) return null;
  const utc = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2])) - JST_OFFSET_MINUTES * 60_000;
  return new Date(utc).toISOString();
}

export function parseSuperGtRacePage(html: string, round: SuperGtRoundLink, season: number): RawRound {
  const $ = cheerio.load(html);
  const days = $(".table_date_tab a[data-target]")
    .toArray()
    .map((a) => $(a).attr("data-target") ?? "");

  const sessions: RawSession[] = [];
  $(".table_box").each((i, box) => {
    const date = days[i];
    if (!date) return;
    // Each entry is repeated for the phone layout (.sp520); the desktop copy (.pc520) is enough.
    $(box)
      .find(".race_box.pc520")
      .each((__, entry) => {
        const heading = $(entry).find("h6").first().text().replace(/\s+/g, " ").trim();
        const m = /SUPER\s*GT\s*[:：]\s*(.+)$/i.exec(heading);
        if (!m) return;
        const session = superGtSession(m[1]);
        const startsAt = jst(date, $(entry).attr("data-from") ?? "");
        if (!session || !startsAt) return;
        const to = $(entry).attr("data-to") ?? "";
        sessions.push({
          key: session.name,
          name: session.name,
          type: session.type,
          startsAt,
          endsAt: to ? jst(date, to) : null,
          cancelled: false,
        });
      });
  });

  return {
    season,
    name: `Round ${round.roundNumber}`,
    circuitHints: [round.place, new URL(round.url).pathname.split("/").at(-1)?.replace(/^round\d+-|-\d+$/g, "") ?? ""],
    timesConfirmed: sessions.some((s) => s.type === "race"),
    sessions,
    startDate: round.startDate,
    endDate: round.endDate,
    sourceRef: round.url,
  };
}

export async function fetchSuperGtSeason(
  ctx: SourceContext,
  year: number,
): Promise<{ rounds: RawRound[]; complete: boolean; warnings: string[] }> {
  const links = parseSuperGtCalendar(await getPage(ctx, `${SITE}/calendar?series=${year}`), year);
  const rounds: RawRound[] = [];
  const warnings: string[] = [];
  for (const link of links) {
    await ctx.sleep(300);
    try {
      rounds.push(parseSuperGtRacePage(await getPage(ctx, link.url), link, year));
    } catch (error) {
      warnings.push(`${link.url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (links.length > 0 && rounds.length === 0) throw new Error(`Every race page failed: ${warnings.join("; ")}`);
  return { rounds, complete: warnings.length === 0, warnings };
}
