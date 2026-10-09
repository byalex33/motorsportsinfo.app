// Primary → fallback source selection per Series (ADR 0001).
import type { SeriesId } from "@/domain/types";
import { normaliseRounds } from "../normalise";
import type { RawRound, SourceSchedule } from "../types";
import { fetchFiaFeederSeason, type FeederSeries } from "./fia-feeder";
import { defaultContext, errorMessage, type SourceContext } from "./http";
import { fetchJolpicaSeason } from "./jolpica";
import { fetchOpenF1Season } from "./openf1";
import { fetchSportstimesSeason } from "./sportstimes";
import { fetchWecSeasons } from "./wec";

interface Loaded {
  rounds: RawRound[];
  completeSeasons: number[];
  warnings: string[];
}

interface SourceDef {
  name: string;
  load: (ctx: SourceContext, year: number) => Promise<Loaded>;
}

/** Loads `year` (required: throws on failure or nothing listed) and `year + 1` (best effort). */
function perSeason(load: (ctx: SourceContext, year: number) => Promise<{ rounds: RawRound[]; complete?: boolean; warnings?: string[] }>) {
  return async (ctx: SourceContext, year: number): Promise<Loaded> => {
    const current = await load(ctx, year);
    if (current.rounds.length === 0) throw new Error(`No Rounds for ${year}`);
    const result: Loaded = {
      rounds: [...current.rounds],
      completeSeasons: current.complete === false ? [] : [year],
      warnings: [...(current.warnings ?? [])],
    };
    try {
      await ctx.sleep(400);
      const next = await load(ctx, year + 1);
      result.rounds.push(...next.rounds);
      result.warnings.push(...(next.warnings ?? []));
      if (next.rounds.length > 0 && next.complete !== false) result.completeSeasons.push(year + 1);
    } catch {
      // Next season not published yet (404/500 or empty) — normal for most of the year.
    }
    return result;
  };
}

const wrap = (fn: (ctx: SourceContext, year: number) => Promise<RawRound[]>) => async (ctx: SourceContext, year: number) => ({
  rounds: await fn(ctx, year),
});

const feeder = (series: FeederSeries): { primary: SourceDef; fallback: SourceDef } => ({
  primary: {
    name: series === "f2" ? "fiaformula2" : "fiaformula3",
    load: perSeason((ctx, year) => fetchFiaFeederSeason(ctx, series, year)),
  },
  fallback: {
    name: "sportstimes",
    load: perSeason(wrap((ctx, year) => fetchSportstimesSeason(ctx, series, year))),
  },
});

export const SOURCES: Record<SeriesId, { primary: SourceDef; fallback?: SourceDef }> = {
  f1: {
    primary: { name: "openf1", load: perSeason(wrap(fetchOpenF1Season)) },
    fallback: { name: "jolpica", load: perSeason(wrap(fetchJolpicaSeason)) },
  },
  f2: feeder("f2"),
  f3: feeder("f3"),
  // fiawec.com scraping works, so TheSportsDB is not used. WEC has no fallback.
  wec: { primary: { name: "fiawec", load: fetchWecSeasons } },
};

export class SourceFailure extends Error {
  constructor(
    readonly series: SeriesId,
    readonly errors: string[],
  ) {
    super(`All sources failed for ${series}: ${errors.join(" | ")}`);
  }
}

/** Reads a Series' schedule for the current and next season: primary, then fallback if the primary fails. */
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
      const loaded = await def.load(ctx, year);
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
      errors.push(`${def.name}: ${errorMessage(error)}`);
    }
  }
  throw new SourceFailure(series, errors);
}
