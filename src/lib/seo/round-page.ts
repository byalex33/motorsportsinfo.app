// Stable, indexable URLs for a Round: /f1/2026/united-states-grand-prix.
// The Round's own slug is the Circuit id ("cota"), which is stable in the database but says nothing a
// search matches. The page slug comes from the Round's name instead. The sync stores it the first time it
// publishes the Round (rounds.page_slug) and never changes it, so a source renaming the Round ("São Paulo
// Grand Prix" → "Brazilian Grand Prix") keeps its URL. Without a stored slug (the live sources, or before
// the sync has stored one) it is derived from the name. Either way every caller (the page, the calendar,
// the Series page, the sitemap) must index the same set of Rounds — the whole loaded schedule, not just the
// upcoming ones — or a collision suffix would disagree.
//
// A Round whose every Session is cancelled does not take the plain slug from one that was run. The plain
// slug stays with the Round that happened, and a previously published collision suffix ("-2") redirects
// there. Sources mark this differently (OpenF1 is_cancelled, sportstimes canceled, a Schedule Override);
// the page only looks at the Sessions. The sync does not store a cancelled Round's slug, so a Round that
// is cancelled when first published never keeps a slug the Round that is run needs.
import type { Circuit, Round, SeriesId } from "@/domain/types";
import { SERIES } from "@/domain/series";
import { everySessionCancelled } from "@/lib/round-status";
import { slugify } from "@/server/schedule/normalise";
import { formatRoundDates } from "@/lib/time-format";
import { locality, NUMBERED, roundDisplayName, roundEventName } from "./json-ld";

export interface RoundPageSource {
  round: Pick<Round, "id" | "series" | "season" | "slug" | "name" | "startDate" | "pageSlug">;
  circuit: Pick<Circuit, "name" | "location">;
  /** When present, a Round whose every Session is cancelled is kept off the plain slug. */
  sessions?: readonly { status: string }[];
}

/** "united-states-grand-prix", or "round-13-baku" when the name is only a number. */
export function roundPageSlug(source: RoundPageSource): string {
  const { round, circuit } = source;
  const base = slugify(NUMBERED.test(round.name) ? `${round.name} ${locality(circuit)}` : round.name);
  return base || round.slug;
}

function calendarOrder(rounds: readonly RoundPageSource[]): RoundPageSource[] {
  return [...rounds].sort(
    (a, b) => a.round.season - b.round.season || a.round.startDate.localeCompare(b.round.startDate) || a.round.id.localeCompare(b.round.id),
  );
}

function seasonSlug(season: number, slug: string): string {
  return `${season}/${slug}`;
}

/**
 * The slug each Round had when cancelled Rounds took a place in the collision sequence. A suffix that
 * this published and that no Round uses now is what a 308 redirect has to keep working.
 */
function legacyRoundPageSlugs(rounds: readonly RoundPageSource[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const source of calendarOrder(rounds)) {
    const base = roundPageSlug(source);
    let slug = base;
    let n = 2;
    while (used.has(seasonSlug(source.round.season, slug))) slug = `${base}-${n++}`;
    used.add(seasonSlug(source.round.season, slug));
    out.set(source.round.id, slug);
  }
  return out;
}

/**
 * One page slug per Round. Among Rounds that were not cancelled, the earlier one in a season keeps the
 * plain slug and a later one with the same name (a Formula E double-header) gets "-2". A cancelled Round
 * keeps the plain slug only when nothing else needs it; otherwise it is "{slug}-cancelled", which is
 * noindex. Order is the schedule's calendar order.
 *
 * A non-cancelled Round does not move onto another non-cancelled Round's previously published slug, so
 * that old URL can redirect instead of changing which Round it is.
 *
 * A Round with a stored page slug keeps it, before any of the above, and no other Round gets it. The sync
 * stores what this gives, so it and the read side agree on every suffix.
 */
export function assignRoundPageSlugs(rounds: readonly RoundPageSource[]): Map<string, string> {
  const ordered = calendarOrder(rounds);
  const legacy = legacyRoundPageSlugs(ordered);
  const cancelled = (source: RoundPageSource) => everySessionCancelled(source.sessions);
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const source of ordered) {
    const stored = source.round.pageSlug;
    // Two Rounds never share a page: a clash (which the sync never stores) leaves the later one derived.
    if (!stored || used.has(seasonSlug(source.round.season, stored))) continue;
    used.add(seasonSlug(source.round.season, stored));
    out.set(source.round.id, stored);
  }
  const run = ordered.filter((source) => !cancelled(source));
  const reserved = new Set(run.map((source) => seasonSlug(source.round.season, legacy.get(source.round.id) ?? "")));
  const live = run.filter((source) => !out.has(source.round.id));

  const groups = new Map<string, RoundPageSource[]>();
  for (const source of live) {
    const key = seasonSlug(source.round.season, roundPageSlug(source));
    const list = groups.get(key) ?? [];
    list.push(source);
    groups.set(key, list);
  }

  for (const source of live) {
    const base = roundPageSlug(source);
    const index = groups.get(seasonSlug(source.round.season, base))?.indexOf(source) ?? 0;
    const ownLegacy = legacy.get(source.round.id) ?? "";
    let n = index === 0 ? 1 : index + 1;
    let slug = n === 1 ? base : `${base}-${n}`;
    const taken = (candidate: string) => {
      const key = seasonSlug(source.round.season, candidate);
      if (used.has(key)) return true;
      // Its own old URL is fine to keep. Another Round's old URL has to stay free to redirect.
      return candidate !== ownLegacy && reserved.has(key);
    };
    while (taken(slug)) slug = `${base}-${++n}`;
    used.add(seasonSlug(source.round.season, slug));
    out.set(source.round.id, slug);
  }

  const blocked = new Set<string>();
  for (const source of run) {
    const from = legacy.get(source.round.id);
    const to = out.get(source.round.id);
    if (from && to && from !== to) blocked.add(seasonSlug(source.round.season, from));
  }
  for (const source of ordered) {
    if (!cancelled(source) || out.has(source.round.id)) continue;
    const base = roundPageSlug(source);
    const candidates = [base, `${base}-cancelled`];
    let n = 2;
    let slug = candidates.find((candidate) => !used.has(seasonSlug(source.round.season, candidate)) && !blocked.has(seasonSlug(source.round.season, candidate)));
    while (!slug) {
      const candidate = `${base}-cancelled-${n++}`;
      if (!used.has(seasonSlug(source.round.season, candidate)) && !blocked.has(seasonSlug(source.round.season, candidate))) slug = candidate;
    }
    used.add(seasonSlug(source.round.season, slug));
    out.set(source.round.id, slug);
  }
  return out;
}

/**
 * The path a previously published collision suffix should 308 to, or null when `pageSlug` is a current
 * page (or never was one). Only a Round that was not cancelled moves; its old suffix must not be where
 * another Round now lives.
 */
export function retiredRoundPagePath(rounds: readonly RoundPageSource[], season: number, pageSlug: string): string | null {
  const legacy = legacyRoundPageSlugs(rounds);
  const canonical = assignRoundPageSlugs(rounds);
  const current = new Set(rounds.map((source) => seasonSlug(source.round.season, canonical.get(source.round.id) ?? "")));
  for (const source of rounds) {
    if (everySessionCancelled(source.sessions) || source.round.season !== season) continue;
    const from = legacy.get(source.round.id);
    const to = canonical.get(source.round.id);
    if (!from || !to || from !== pageSlug || from === to) continue;
    if (current.has(seasonSlug(season, from))) continue;
    return roundPagePath(source.round.series, source.round.season, to);
  }
  return null;
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
 * Whether a page slug is a collision suffix of the Round's own slug ("daytona-500-2"), not just a name that
 * ends in a number ("daytona-500").
 */
function isSuffixedSlug(pageSlug: string, round: Round, circuit: Circuit): boolean {
  const base = roundPageSlug({ round, circuit });
  return pageSlug.startsWith(`${base}-`) && /^\d+$/.test(pageSlug.slice(base.length + 1));
}

/**
 * Search-facing title and description for a Round page. Stable for that Round, unlike the Series page.
 * `pageSlug` is the URL slug: when a season has two Rounds with the same name, the later one's slug ends
 * in "-2" and the dates go in the title so the two pages are not identical. `renderedAt` (ISO) tells a
 * finished Round apart, so one without published Session times is not promised them "once published".
 */
export function roundPageSeo(
  series: SeriesId,
  round: Round,
  circuit: Circuit,
  pageSlug?: string,
  cancelled = false,
  renderedAt?: string,
): { title: string; description: string; lead: string } {
  const info = SERIES[series];
  const name = roundEventName(series, round, circuit);
  const dates = formatRoundDates(round.startDate, round.endDate);
  const heading = pageSlug && isSuffixedSlug(pageSlug, round, circuit) ? `${name} (${dates})` : name;
  const place = `${roundDisplayName(series, round, circuit)}, ${dates} at ${circuit.name}`;
  if (cancelled) {
    return {
      title: `${name} cancelled`,
      description: `${place} was cancelled. It is not a completed ${info.shortName} Round; the season's timetable is on the ${info.shortName} page.`,
      lead: `${name} at ${circuit.name}, ${dates}, was cancelled.`,
    };
  }
  const finished = renderedAt !== undefined && round.endDate < renderedAt.slice(0, 10);
  if (!round.sessionTimesConfirmed && finished) {
    return {
      title: `${heading} – dates & Circuit`,
      description: `${place}. This ${info.shortName} Round has finished; the ${info.shortName} page has the next Round's Session times and forecast.`,
      lead: `${name} at ${circuit.name}, ${dates}. This Round has finished.`,
    };
  }
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
