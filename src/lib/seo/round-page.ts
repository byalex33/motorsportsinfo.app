// Stable, indexable URLs for a Round: /f1/2026/united-states-grand-prix.
// The Round's own slug is the Circuit id ("cota"), which is stable in the database but says nothing a
// search matches. The page slug comes from the Round's name instead. The sync stores it the first time it
// publishes the Round (rounds.page_slug) and never changes it, so a source renaming the Round ("São Paulo
// Grand Prix" → "Brazilian Grand Prix") keeps its URL. Without a stored slug (the live sources, or before
// the sync has stored one) it is derived from the name. Either way every caller (the page, the calendar,
// the Series page, the sitemap) must index the same set of Rounds — the whole loaded schedule, not just the
// upcoming ones — or a collision suffix would disagree.
import type { Circuit, Round, SeriesId } from "@/domain/types";
import { SERIES } from "@/domain/series";
import { slugify } from "@/server/schedule/normalise";
import { formatRoundDates } from "@/lib/time-format";
import { roundDisplayName, roundEventName } from "./json-ld";

export interface RoundPageSource {
  round: Pick<Round, "id" | "series" | "season" | "slug" | "name" | "startDate" | "pageSlug">;
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
 * One page slug per Round. A Round with a stored page slug keeps it. Every other Round gets the slug of its
 * name: the earlier Round in a season keeps the plain slug, and a later Round with the same name (a Formula E
 * double-header), or one whose slug another Round already stores, gets "-2". Order is the schedule's
 * calendar order. The sync stores what this gives, so it and the read side agree on every suffix.
 */
export function assignRoundPageSlugs(rounds: readonly RoundPageSource[]): Map<string, string> {
  const ordered = [...rounds].sort(
    (a, b) => a.round.season - b.round.season || a.round.startDate.localeCompare(b.round.startDate) || a.round.id.localeCompare(b.round.id),
  );
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const source of ordered) {
    const stored = source.round.pageSlug;
    // Two Rounds never share a page: a clash (which the sync never stores) leaves the later one derived.
    if (!stored || used.has(`${source.round.season}/${stored}`)) continue;
    used.add(`${source.round.season}/${stored}`);
    out.set(source.round.id, stored);
  }
  for (const source of ordered) {
    if (out.has(source.round.id)) continue;
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
 * Names a Series' sources give the same Round that share no words, as page slugs, in pairs. Names that
 * only add words ("Bahrain Grand Prix in Malaysia") need no entry: see findRoundPageRedirect.
 */
const ROUND_PAGE_ALIASES: Partial<Record<SeriesId, [string, string][]>> = {
  f1: [["brazilian-grand-prix", "sao-paulo-grand-prix"]],
};

function aliasesOf(series: SeriesId, slug: string): string[] {
  return (ROUND_PAGE_ALIASES[series] ?? []).flatMap(([a, b]) => (a === slug ? [b] : b === slug ? [a] : []));
}

/** True when one slug is the other plus more words ("bahrain-grand-prix-in-malaysia"), not a "-2" suffix. */
function addsWords(longer: string, shorter: string): boolean {
  return longer.startsWith(`${shorter}-`) && !/^\d+$/.test(longer.slice(shorter.length + 1));
}

/**
 * The Round a page slug that findRoundPage does not know most likely meant, so the page can redirect to it:
 * a Round in that season whose slug from its current name, Circuit id or known alternate name matches (an
 * old link from before a rename, or the other source's name), or else the one Round whose slug and the
 * requested one differ only by added words. Null when nothing matches, or the added words match more than one.
 */
export function findRoundPageRedirect<T extends RoundPageSource>(
  rounds: readonly T[],
  season: number,
  pageSlug: string,
): (T & { pageSlug: string; path: string }) | null {
  const inSeason = indexRoundPages(rounds).filter((round) => round.round.season === season);
  const exact = inSeason.find((round) => {
    const names = [round.pageSlug, roundPageSlug(round)];
    const aliases = names.flatMap((slug) => aliasesOf(round.round.series, slug));
    return [...names, round.round.slug, ...aliases].includes(pageSlug);
  });
  if (exact) return exact;
  const loose = inSeason.filter((round) =>
    [round.pageSlug, roundPageSlug(round)].some((slug) => addsWords(slug, pageSlug) || addsWords(pageSlug, slug)),
  );
  if (loose.length === 1) return loose[0] ?? null;
  // Two Rounds with the same name ("Bahrain Grand Prix" twice, the second at Sepang): the requested slug's
  // added words ("in-malaysia") pick the one whose Circuit they describe.
  const placed = loose.filter((round) => {
    const extra = addedWords(roundPageSlug(round), pageSlug);
    if (extra.length === 0) return false;
    const place = new Set(slugify(`${round.circuit.name} ${round.circuit.location}`).split("-"));
    return extra.some((word) => word.length > 2 && place.has(word));
  });
  return placed.length === 1 ? (placed[0] ?? null) : null;
}

/** The words `longer` adds after `shorter` ("bahrain-grand-prix-in-malaysia" → ["in", "malaysia"]), or none. */
function addedWords(shorter: string, longer: string): string[] {
  return addsWords(longer, shorter) ? longer.slice(shorter.length + 1).split("-") : [];
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
