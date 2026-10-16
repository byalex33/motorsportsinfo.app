import { cacheLife, cacheTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db/client";
import type { Circuit, FeaturedRoundResult, ForecastResult, Round, RoundDocumentsResult, SeriesId, Session } from "@/domain/types";
import { roundShortName } from "@/lib/seo/json-ld";
import { indexRoundPages } from "@/lib/seo/round-page";
import { formatRoundDates } from "@/lib/time-format";
import { getRoundDocuments } from "@/server/documents";
import { getSessionResults } from "@/server/results";
import { getFeaturedRound, listScheduleRounds } from "@/server/schedule";
import { getSessionForecast } from "@/server/weather";

/** The Featured Round, or "unavailable" when there is no schedule to read (see below). */
export type SeriesFeatured = FeaturedRoundResult | { kind: "unavailable" };

/** One Round on the Series page's season list, linking to its own page. */
export interface SeasonRoundLink {
  id: string;
  season: number;
  /** "Singapore Grand Prix", "Round 13 · Baku". */
  name: string;
  /** "9–11 Oct 2026", in Track Time. */
  dates: string;
  path: string;
  /** The Round this Series page is showing. */
  featured: boolean;
}

export interface SeriesPageData {
  featured: SeriesFeatured;
  /** Every Round the schedule loaded, so the page can link to each Round's own page. */
  seasonRounds: SeasonRoundLink[];
  /** Keyed by Session id. Missing for cancelled Sessions and when times are TBC. */
  forecasts: Record<string, ForecastResult>;
  /**
   * Ids of the finished Sessions the site has a Session Result for (F1), so they get a RESULTS chip. Only
   * that one exists: the classification is a spoiler, so the page never carries it. The Results modal loads
   * it from /api/results/… when the viewer chooses to see it.
   */
  results: string[];
  /** The Featured Round's FIA documents. Null for Series the FIA publishes none for, or with no Round. */
  documents: RoundDocumentsResult | null;
  /** ISO time this data was rendered — shown as "last updated" when offline. */
  renderedAt: string;
}

/**
 * Everything a Series page shows, cached for ~5 minutes. Tagged `series:${id}` and rendered under
 * `/${id}`, so the schedule sync's revalidateTag/revalidatePath refreshes it straight away.
 */
/** Forecasts, Session Result ids and FIA Documents for one Round. Shared by the Series page and Round pages. */
export async function assembleRound(
  series: SeriesId,
  round: Round,
  circuit: Circuit,
  sessions: Session[],
): Promise<Pick<SeriesPageData, "forecasts" | "results" | "documents">> {
  const documents = getRoundDocuments(round, circuit);
  const forecasts: Record<string, ForecastResult> = {};
  let results: string[] = [];

  if (round.sessionTimesConfirmed) {
    const finished = finishedSessions(sessions, Date.now());
    const [entries, sessionResults] = await Promise.all([
      Promise.all(
        sessions.map(async (session) => {
          if (session.status === "cancelled") return null;
          try {
            return [session.id, await getSessionForecast(circuit, session.startsAt)] as const;
          } catch {
            return [session.id, { kind: "unavailable" } as ForecastResult] as const;
          }
        }),
      ),
      getSessionResults(series, round.season, finished),
    ]);
    for (const entry of entries) if (entry) forecasts[entry[0]] = entry[1];
    results = Object.keys(sessionResults);
  }

  return { forecasts, results, documents: await documents };
}

export async function getSeriesPageData(series: SeriesId): Promise<SeriesPageData> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 86_400 });
  cacheTag(`series:${series}`);

  let featured: SeriesFeatured;
  let seasonRounds: SeasonRoundLink[] = [];
  try {
    featured = await getFeaturedRound(series);
    const featuredId = featured.kind === "round" ? featured.round.id : null;
    seasonRounds = indexRoundPages(await listScheduleRounds(series)).map((round) => ({
      id: round.round.id,
      season: round.round.season,
      name: roundShortName(round.round, round.circuit),
      dates: formatRoundDates(round.round.startDate, round.round.endDate),
      path: round.path,
      featured: round.round.id === featuredId,
    }));
  } catch (error) {
    unstable_rethrow(error);
    // With a database a failed read still throws, so the last good page stays cached. Without one
    // (local dev, preview builds) the live sources are all there is: a Series whose source fails or
    // isn't wired up yet shows a "schedule coming soon" state instead of failing the page or the build.
    if (getDb()) throw error;
    console.warn(`[series:${series}] schedule unavailable: ${error instanceof Error ? error.message : String(error)}`);
    featured = { kind: "unavailable" };
  }

  const detail =
    featured.kind === "round"
      ? await assembleRound(series, featured.round, featured.circuit, featured.sessions)
      : { forecasts: {}, results: [], documents: null };

  return { featured, seasonRounds, ...detail, renderedAt: new Date().toISOString() };
}

/**
 * The Round's Sessions that have finished, the ones a Session Result is looked up for. The Results route
 * passes the same list to getSessionResults, so it reads the page's cache entry instead of OpenF1.
 */
export function finishedSessions(sessions: Session[], now: number): Session[] {
  return sessions.filter((s) => s.status !== "cancelled" && Date.parse(s.endsAt) <= now);
}
