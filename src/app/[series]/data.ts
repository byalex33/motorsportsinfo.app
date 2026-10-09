import { cacheLife, cacheTag } from "next/cache";
import type { FeaturedRoundResult, ForecastResult, SeriesId } from "@/domain/types";
import { getFeaturedRound } from "@/server/schedule";
import { getSessionForecast } from "@/server/weather";

export interface SeriesPageData {
  featured: FeaturedRoundResult;
  /** Keyed by Session id. Missing for cancelled Sessions and when times are TBC. */
  forecasts: Record<string, ForecastResult>;
  /** ISO time this data was rendered — shown as "last updated" when offline. */
  renderedAt: string;
}

/**
 * Everything a Series page shows, cached for ~5 minutes. Tagged `series:${id}` and rendered under
 * `/${id}`, so the schedule sync's revalidateTag/revalidatePath refreshes it straight away.
 */
export async function getSeriesPageData(series: SeriesId): Promise<SeriesPageData> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 86_400 });
  cacheTag(`series:${series}`);

  const featured = await getFeaturedRound(series);
  const forecasts: Record<string, ForecastResult> = {};

  if (featured.kind === "round" && featured.round.sessionTimesConfirmed) {
    const { circuit } = featured;
    const results = await Promise.all(
      featured.sessions.map(async (session) => {
        if (session.status === "cancelled") return null;
        try {
          return [session.id, await getSessionForecast(circuit, session.startsAt)] as const;
        } catch {
          return [session.id, { kind: "unavailable" } as ForecastResult] as const;
        }
      }),
    );
    for (const entry of results) if (entry) forecasts[entry[0]] = entry[1];
  }

  return { featured, forecasts, renderedAt: new Date().toISOString() };
}
