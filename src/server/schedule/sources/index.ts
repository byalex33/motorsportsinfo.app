// Primary → fallback source selection per Series (ADR 0001).
import type { SeriesId } from "@/domain/types";
import { normaliseRounds } from "../normalise";
import type { RawRound, SourceSchedule } from "../types";
import { fetchDtmEvents, fetchDtmSeason } from "./dtm";
import { defaultContext, errorMessage, untilAborted, type SourceContext } from "./http";
import { fetchGtwcCalendar, fetchGtwcSeason } from "./gtwc";
import { fetchImsaSeason } from "./imsa";
import { fetchJolpicaSeason } from "./jolpica";
import { fetchNascarSeason } from "./nascar";
import { fetchOpenF1Season } from "./openf1";
import { fetchSportstimesSeason, type SportstimesSeries } from "./sportstimes";
import { fetchSuperGtSeason } from "./super-gt";
import { fetchWecSeasons } from "./wec";
import { fetchWrcSeason } from "./wrc";

interface Loaded {
  rounds: RawRound[];
  completeSeasons: number[];
  warnings: string[];
}

interface SourceDef {
  name: string;
  load: (ctx: SourceContext, year: number) => Promise<Loaded>;
}

/** One season as a loader reads it. */
interface Season {
  rounds: RawRound[];
  complete?: boolean;
  warnings?: string[];
}

/** `year` (required: throws if nothing is listed) with `year + 1` (null when not published). */
function combine(year: number, current: Season, next: Season | null): Loaded {
  if (current.rounds.length === 0) throw new Error(`No Rounds for ${year}`);
  const result: Loaded = {
    rounds: [...current.rounds],
    completeSeasons: current.complete === false ? [] : [year],
    warnings: [...(current.warnings ?? [])],
  };
  if (next) {
    result.rounds.push(...next.rounds);
    result.warnings.push(...(next.warnings ?? []));
    if (next.rounds.length > 0 && next.complete !== false) result.completeSeasons.push(year + 1);
  }
  return result;
}

/** Loads `year` (required: throws on failure or nothing listed) and `year + 1` (best effort). */
function perSeason(load: (ctx: SourceContext, year: number) => Promise<Season>) {
  return async (ctx: SourceContext, year: number): Promise<Loaded> => {
    const current = await load(ctx, year);
    if (current.rounds.length === 0) throw new Error(`No Rounds for ${year}`);
    let next: Season | null = null;
    try {
      await ctx.sleep(400);
      next = await load(ctx, year + 1);
    } catch {
      // Next season not published yet (404/500 or empty) — normal for most of the year.
    }
    return combine(year, current, next);
  };
}

/**
 * Like perSeason, for a source whose one index (a calendar page, an event list) lists the seasons: the index
 * is fetched once per check and both seasons are read from it. An index that lists `year + 1` but no longer
 * `year` has moved on before 1 January: `year + 1` is kept, with a warning, and `year` is not complete, so
 * its Rounds stay as published.
 */
function fromIndex<T>(
  fetchIndex: (ctx: SourceContext) => Promise<T>,
  load: (ctx: SourceContext, index: T, year: number) => Promise<Season>,
) {
  return async (ctx: SourceContext, year: number): Promise<Loaded> => {
    const index = await fetchIndex(ctx);
    const current = await load(ctx, index, year);
    let next: Season;
    try {
      next = await load(ctx, index, year + 1);
    } catch (error) {
      if (current.rounds.length === 0) throw error;
      next = { rounds: [], warnings: [`${year + 1}: ${errorMessage(error)}`] };
    }
    if (current.rounds.length === 0 && next.rounds.length > 0) {
      return {
        ...combine(year + 1, next, null),
        warnings: [`No ${year} Rounds listed any more; reading ${year + 1} only`, ...(next.warnings ?? [])],
      };
    }
    return combine(year, current, next);
  };
}

const wrap = (fn: (ctx: SourceContext, year: number) => Promise<RawRound[]>) => async (ctx: SourceContext, year: number) => ({
  rounds: await fn(ctx, year),
});

const sportstimes = (series: SportstimesSeries): SourceDef => ({
  name: "sportstimes",
  load: perSeason((ctx, year) => fetchSportstimesSeason(ctx, series, year)),
});

export const SOURCES: Record<SeriesId, { primary: SourceDef; fallback?: SourceDef }> = {
  f1: {
    primary: { name: "openf1", load: perSeason(wrap(fetchOpenF1Season)) },
    fallback: { name: "jolpica", load: perSeason(wrap(fetchJolpicaSeason)) },
  },
  // The MIT-licensed sportstimes dataset, not fiaformula2.com / fiaformula3.com, whose terms forbid
  // extracting their data (ADR 0001). Schedule Overrides correct it when it lags; no fallback.
  f2: { primary: sportstimes("f2") },
  f3: { primary: sportstimes("f3") },
  // fiawec.com scraping works, so TheSportsDB is not used. WEC has no fallback.
  wec: { primary: { name: "fiawec", load: fetchWecSeasons } },
  // The sportstimes dataset is the only source for these Series (ADR 0001); no fallback.
  fe: { primary: sportstimes("fe") },
  indycar: { primary: sportstimes("indycar") },
  motogp: { primary: sportstimes("motogp") },
  "f1-academy": { primary: sportstimes("f1-academy") },
  // Each Series' own feed, with no fallback (ADR 0001).
  wrc: { primary: { name: "wrc.com", load: perSeason(fetchWrcSeason) } },
  imsa: { primary: { name: "imsa-ecal", load: perSeason(fetchImsaSeason) } },
  nascar: { primary: { name: "nascar", load: perSeason(fetchNascarSeason) } },
  "gtwc-europe": { primary: { name: "gt-world-challenge-europe.com", load: fromIndex(fetchGtwcCalendar, fetchGtwcSeason) } },
  dtm: { primary: { name: "dtm.com", load: fromIndex(fetchDtmEvents, fetchDtmSeason) } },
  "super-gt": { primary: { name: "supergt.net", load: perSeason(fetchSuperGtSeason) } },
};

export class SourceFailure extends Error {
  constructor(
    readonly series: SeriesId,
    readonly errors: string[],
  ) {
    super(`All sources failed for ${series}: ${errors.join(" | ")}`);
  }
}

/**
 * Reads a Series' schedule for the current and next season: primary, then fallback if the primary fails.
 * Once `ctx.signal` (the sync run's deadline) aborts, it rejects at once and tries no fallback: a source
 * that swallowed the aborted requests as warnings would otherwise return a half-read schedule.
 */
export async function fetchSeriesSchedule(
  series: SeriesId,
  now: Date = new Date(),
  ctx: SourceContext = defaultContext,
): Promise<SourceSchedule> {
  const year = now.getUTCFullYear();
  const { primary, fallback } = SOURCES[series];
  const errors: string[] = [];
  for (const [def, isFallback] of [
    [primary, false],
    [fallback, true],
  ] as const) {
    if (!def) continue;
    try {
      ctx.signal?.throwIfAborted();
      const loaded = await untilAborted(def.load(ctx, year), ctx.signal);
      ctx.signal?.throwIfAborted();
      const { rounds, problems } = normaliseRounds(series, loaded.rounds);
      return {
        series,
        source: def.name,
        isFallback,
        rounds,
        completeSeasons: loaded.completeSeasons,
        problems,
        warnings: [...errors.map((e) => `primary failed: ${e}`), ...loaded.warnings],
      };
    } catch (error) {
      if (ctx.signal?.aborted) throw new SourceFailure(series, [...errors, `${def.name}: ${errorMessage(ctx.signal.reason)}`]);
      errors.push(`${def.name}: ${errorMessage(error)}`);
    }
  }
  throw new SourceFailure(series, errors);
}
