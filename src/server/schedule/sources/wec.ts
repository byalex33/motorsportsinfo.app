// WEC primary source: fiawec.com. The season page links each Round's race page
// (/en/race/<name>-<year>); its header also links next season's published Rounds. Each race page
// lists Sessions as blocks with a bold name and a <span data-timestamp="<unix seconds>"> start time.
// No end times are given, so every WEC Session end is estimated. A page listing only the Race
// (as next season's pages do) is treated as "Times TBC".
import * as cheerio from "cheerio";
import type { SessionType } from "@/domain/types";
import { isoDate, monthNumber } from "./dates";
import { getPage, type SourceContext } from "./http";
import type { RawRound, RawSession } from "../types";

const SITE = "https://www.fiawec.com";

export function wecSessionType(name: string): SessionType | null {
  const n = name.toLowerCase();
  if (/hyperpole/.test(n)) return "hyperpole";
  if (/qualifying/.test(n)) return "qualifying";
  if (/practice|warm[\s-]?up|test day|collective test/.test(n)) return "practice";
  if (/^race\b|\brace$/.test(n.trim())) return "race";
  return null;
}

/** Race page slugs for `year` (e.g. "6-hours-of-barcelona-2026"), in page order, without prologues/tests. */
export function parseWecRaceLinks(html: string, year: number): string[] {
  const $ = cheerio.load(html);
  const slugs: string[] = [];
  $('a[href*="/en/race/"]').each((_, a) => {
    const href = ($(a).attr("href") ?? "").split(/[?#]/)[0];
    const m = /\/en\/race\/([a-z0-9-]+?)\/?$/.exec(href);
    if (!m) return;
    const slug = m[1];
    if (!slug.endsWith(`-${year}`) || /prologue|test/.test(slug)) return;
    if (!slugs.includes(slug)) slugs.push(slug);
  });
  return slugs;
}

/** "From 16 to 18 October 2026", "From 30 September to 2 October 2026" → Track Time dates. */
export function parseWecDateRange(text: string): { startDate: string; endDate: string } | null {
  const m = /from\s+(\d{1,2})(?:\s+([a-z]+))?(?:\s+(\d{4}))?\s+to\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})/i.exec(text);
  if (!m) return null;
  const endMonth = monthNumber(m[5]);
  const endYear = Number(m[6]);
  const startMonth = m[2] ? monthNumber(m[2]) : endMonth;
  const startYear = m[3] ? Number(m[3]) : endYear;
  if (!endMonth || !startMonth) return null;
  return {
    startDate: isoDate(startYear, startMonth, Number(m[1])),
    endDate: isoDate(endYear, endMonth, Number(m[4])),
  };
}

export function parseWecRacePage(html: string, info: { season: number; slug: string; url: string }): RawRound {
  const $ = cheerio.load(html);
  const name = $("h1").first().text().replace(/\s+/g, " ").trim();
  if (!name) throw new Error("No race name (h1) on page");
  const dates = parseWecDateRange($("h1").first().parent().text().replace(/\s+/g, " "));

  const sessions: RawSession[] = [];
  $("[data-timestamp]").each((_, el) => {
    const seconds = Number($(el).attr("data-timestamp"));
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    // The Session block is the nearest ancestor that also holds a bold name label.
    let sessionName = "";
    let block = $(el).parent();
    for (let depth = 0; depth < 5 && block.length; depth++) {
      const label = block
        .find(".fw-bold")
        .filter((__, node) => $(node).find("[data-timestamp]").length === 0)
        .first();
      sessionName = label.text().replace(/\s+/g, " ").trim();
      if (sessionName) break;
      block = block.parent();
    }
    if (!sessionName) return;
    sessions.push({
      key: sessionName,
      name: sessionName,
      type: wecSessionType(sessionName),
      startsAt: new Date(seconds * 1000).toISOString(),
      endsAt: null,
      cancelled: /\bcancell?ed\b/i.test(block.text()),
    });
  });

  // Drop title sponsors: "TotalEnergies 6 Hours of Spa-Francorchamps" → "6 Hours of Spa-Francorchamps".
  const hoursName = /\b\d+\s+hours\s+of\s+.+$/i.exec(name)?.[0];
  return {
    season: info.season,
    name: hoursName ?? name,
    circuitHints: [name, info.slug.replace(new RegExp(`-${info.season}$`), "")],
    // Next season's pages list only a provisional Race start; that's still "Times TBC".
    timesConfirmed: sessions.length >= 2,
    sessions,
    startDate: dates?.startDate ?? null,
    endDate: dates?.endDate ?? null,
    sourceRef: info.url,
  };
}

/**
 * Fetches `year` and, best-effort, `year + 1` from the `year` season page and each race page,
 * sequentially with a small delay. Throws when the season page fails or lists nothing for `year`.
 */
export async function fetchWecSeasons(
  ctx: SourceContext,
  year: number,
): Promise<{ rounds: RawRound[]; completeSeasons: number[]; warnings: string[] }> {
  const seasonHtml = await getPage(ctx, `${SITE}/en/season/${year}`);
  const rounds: RawRound[] = [];
  const warnings: string[] = [];
  const completeSeasons: number[] = [];
  for (const season of [year, year + 1]) {
    const slugs = parseWecRaceLinks(seasonHtml, season);
    if (season === year && slugs.length === 0) throw new Error(`No Rounds listed on ${SITE}/en/season/${year}`);
    let failures = 0;
    for (const slug of slugs) {
      await ctx.sleep(300);
      const url = `${SITE}/en/race/${slug}`;
      try {
        rounds.push(parseWecRacePage(await getPage(ctx, url), { season, slug, url }));
      } catch (error) {
        failures++;
        warnings.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (season === year && failures === slugs.length) throw new Error(`Every race page failed: ${warnings.join("; ")}`);
    // Next season's list comes from header links, so it is never treated as complete.
    if (season === year && failures === 0) completeSeasons.push(season);
  }
  return { rounds, completeSeasons, warnings };
}
