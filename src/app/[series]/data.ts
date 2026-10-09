import { cacheLife, cacheTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db/client";
import type { FeaturedRoundResult, ForecastResult, SeriesId } from "@/domain/types";
import { getFeaturedRound } from "@/server/schedule";
import { getSessionForecast } from "@/server/weather";

/** The Featured Round, or "unavailable" when there is no schedule to read (see below). */
export type SeriesFeatured = FeaturedRoundResult | { kind: "unavailable" };

export interface SeriesPageData {
  featured: SeriesFeatured;
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

  let featured: SeriesFeatured;
  try {
    featured = await getFeaturedRound(series);
  } catch (error) {
    unstable_rethrow(error);
    // With a database a failed read still throws, so the last good page stays cached. Without one
    // (local dev, preview builds) the live sources are all there is: a Series whose source fails or
    // isn't wired up yet shows a "schedule coming soon" state instead of failing the page or the build.
    if (getDb()) throw error;
    console.warn(`[series:${series}] schedule unavailable: ${error instanceof Error ? error.message : String(error)}`);
    featured = { kind: "unavailable" };
  }
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
