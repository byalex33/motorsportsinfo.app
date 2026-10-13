import { cacheLife, cacheTag } from "next/cache";
import type { ForecastResult, SpecialEvent } from "@/domain/types";
import { getSpecialEvent } from "@/server/schedule";
import { getSessionForecast } from "@/server/weather";

export interface SpecialEventPageData {
  event: SpecialEvent;
  /** Keyed by Session id. Missing for cancelled Sessions. */
  forecasts: Record<string, ForecastResult>;
  /** ISO time this data was rendered — shown as "last updated" when offline. */
  renderedAt: string;
}

/** Everything a Special Event page shows, cached for ~5 minutes like a Series page. Null for an unknown slug. */
export async function getSpecialEventPageData(slug: string): Promise<SpecialEventPageData | null> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 86_400 });
  cacheTag(`special:${slug}`);

  const event = getSpecialEvent(slug);
  if (!event) return null;
  const entries = await Promise.all(
    event.sessions
      .filter((s) => s.status !== "cancelled")
      .map(async (s) => [s.id, await getSessionForecast(event.circuit, s.startsAt)] as const),
  );
  return { event, forecasts: Object.fromEntries(entries), renderedAt: new Date().toISOString() };
}
