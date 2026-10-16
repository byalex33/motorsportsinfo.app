import { cacheLife, cacheTag } from "next/cache";
import { SERIES_IDS, type Circuit, type Round, type SeriesId, type Session } from "@/domain/types";
import { findRoundPage } from "@/lib/seo/round-page";
import { listScheduleRounds, scheduleTag } from "@/server/schedule";
import { assembleRound, getSeriesPageData, type SeriesPageData } from "../../data";

export interface RoundPageData extends Pick<SeriesPageData, "forecasts" | "results" | "documents" | "renderedAt"> {
  round: Round;
  roundNumber: number | null;
  circuit: Circuit;
  sessions: Session[];
  pageSlug: string;
  path: string;
}

/**
 * One Round's page. Null when this Series has no Round at that season and page slug. Tagged with the
 * Series' schedule, so the sync's revalidateTag refreshes it along with the Series page.
 */
export async function getRoundPageData(series: SeriesId, season: number, pageSlug: string): Promise<RoundPageData | null> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 86_400 });
  cacheTag(scheduleTag(series));

  const found = findRoundPage(await listScheduleRounds(series), season, pageSlug);
  if (!found) return null;
  const detail = await assembleRound(series, found.round, found.circuit, found.sessions);
  return {
    round: found.round,
    roundNumber: found.roundNumber,
    circuit: found.circuit,
    sessions: found.sessions,
    pageSlug: found.pageSlug,
    path: found.path,
    ...detail,
    renderedAt: new Date().toISOString(),
  };
}

/**
 * One Round per Series for the build: its Featured Round, or the first Round it has. Every other Round
 * is rendered on its first request (see the page's ensureStatic). A build with no schedule at all still
 * lists one param, which renders the not-found page.
 */
export async function featuredRoundStaticParams(): Promise<{ series: string; season: string; round: string }[]> {
  const params: { series: string; season: string; round: string }[] = [];
  // The Series page's cached read, not a second scrape: it already lists every Round and its page path.
  for (const series of SERIES_IDS) {
    const { featured, seasonRounds } = await getSeriesPageData(series);
    const featuredId = featured.kind === "round" ? featured.round.id : null;
    const page = seasonRounds.find((round) => round.id === featuredId) ?? seasonRounds[0];
    if (!page) continue;
    const [, , season, round] = page.path.split("/");
    if (season && round) params.push({ series, season, round });
  }
  return params.length > 0 ? params : [{ series: "f1", season: "2026", round: "none" }];
}
