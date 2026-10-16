// Stable, indexable URLs for a Round: /f1/2026/united-states-grand-prix.
// The Round's own slug is the Circuit id ("cota"), which is stable in the database but says nothing a
// search matches. The page slug comes from the Round's name instead. It is derived, not stored, so every
// caller (the page, the calendar, the Series page, the sitemap) must derive it from the same set of Rounds
// — the whole loaded schedule, not just the upcoming ones — or a collision suffix would disagree.
import type { Circuit, Round, SeriesId } from "@/domain/types";
import { SERIES } from "@/domain/series";
import { slugify } from "@/server/schedule/normalise";
import { formatRoundDates } from "@/lib/time-format";
import { roundDisplayName, roundEventName } from "./json-ld";

export interface RoundPageSource {
  round: Pick<Round, "id" | "series" | "season" | "slug" | "name" | "startDate">;
  circuit: Pick<Circuit, "name" | "location">;
}

const NUMBERED = /^Round \d+$/;

function locality(circuit: Pick<Circuit, "name" | "location">): string {
  return circuit.location.split(",")[0]?.trim() || circuit.name;
}

/** "united-states-grand-prix", or "round-13-baku" when the name is only a number. */
export function roundPageSlug(source: RoundPageSource): string {
  const { round, circuit } = source;
  const base = slugify(NUMBERED.test(round.name) ? `${round.name} ${locality(circuit)}` : round.name);
  return base || round.slug;
}

/**
 * One page slug per Round. The earlier Round in a season keeps the plain slug; a later Round with the
 * same name (a Formula E double-header) gets "-2". Order is the schedule's calendar order.
 */
export function assignRoundPageSlugs(rounds: readonly RoundPageSource[]): Map<string, string> {
  const ordered = [...rounds].sort(
    (a, b) => a.round.season - b.round.season || a.round.startDate.localeCompare(b.round.startDate) || a.round.id.localeCompare(b.round.id),
  );
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const source of ordered) {
    const base = roundPageSlug(source);
    let slug = base;
    let n = 2;
    while (used.has(`${source.round.season}/${slug}`)) slug = `${base}-${n++}`;
    used.add(`${source.round.season}/${slug}`);
    out.set(source.round.id, slug);
  }
  return out;
}

export function roundPagePath(series: SeriesId, season: number, pageSlug: string): string {
  return `/${series}/${season}/${pageSlug}`;
}

/** The same Rounds, each with the page slug and path every surface must link to. */
export function indexRoundPages<T extends RoundPageSource>(rounds: readonly T[]): (T & { pageSlug: string; path: string })[] {
  const slugs = assignRoundPageSlugs(rounds);
  return rounds.map((round) => {
    const pageSlug = slugs.get(round.round.id) ?? round.round.slug;
    return { ...round, pageSlug, path: roundPagePath(round.round.series, round.round.season, pageSlug) };
  });
}

export function findRoundPage<T extends RoundPageSource>(
  rounds: readonly T[],
  season: number,
  pageSlug: string,
): (T & { pageSlug: string; path: string }) | null {
  return indexRoundPages(rounds).find((round) => round.round.season === season && round.pageSlug === pageSlug) ?? null;
}

/**
 * Search-facing title and description for a Round page. Stable for that Round, unlike the Series page.
 * `pageSlug` is the URL slug: when a season has two Rounds with the same name, the later one's slug ends
 * in "-2" and the dates go in the title so the two pages are not identical.
 */
export function roundPageSeo(
  series: SeriesId,
  round: Round,
  circuit: Circuit,
  pageSlug?: string,
): { title: string; description: string; lead: string } {
  const info = SERIES[series];
  const name = roundEventName(series, round, circuit);
  const dates = formatRoundDates(round.startDate, round.endDate);
  const heading = pageSlug && /-\d+$/.test(pageSlug) ? `${name} (${dates})` : name;
  const place = `${roundDisplayName(series, round, circuit)}, ${dates} at ${circuit.name}`;
  if (!round.sessionTimesConfirmed) {
    return {
      title: `${heading} schedule – dates, times TBC & weather`,
      description: `${place}. ${info.shortName} Session times are TBC; they appear here in your time zone, with the forecast, once published.`,
      lead: `${name} at ${circuit.name}, ${dates}. Session times are TBC; they appear here in your time zone, with the forecast, once published.`,
    };
  }
  return {
    title: `${heading} schedule – session times & weather`,
    description: `${place}: the full ${info.shortName} timetable, every Session in your time zone or Track Time, with countdown and weather.`,
    lead: `Session times for the ${name} at ${circuit.name}, ${dates}: every Session in your time zone or Track Time, with the forecast.`,
  };
}
