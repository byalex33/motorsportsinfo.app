import type { MetadataRoute } from "next";
import { unstable_rethrow } from "next/navigation";
import { SERIES_IDS, type SeriesId } from "@/domain/types";
import { seriesLastModified } from "@/lib/seo/last-modified";
import { indexRoundPages } from "@/lib/seo/round-page";
import { everySessionCancelled } from "@/lib/round-status";
import { absoluteUrl } from "@/lib/site";
import { getRoundUpdatedAt, getScheduleUpdatedAt, listScheduleRounds, listSpecialEvents } from "@/server/schedule";
import { getSeriesPageData } from "./[series]/data";

/**
 * When this deployment was built: BUILT_AT is fixed by next.config.ts at build time, so every instance and
 * every regeneration gives the same date. Pages without data change only with a deploy.
 */
const BUILT_AT = process.env.BUILT_AT ?? new Date().toISOString();

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * A Series page's last real content change: its Featured Round's schedule or newest FIA Document.
 * Reads the same cached entry the page does, plus one small cached schedule read.
 */
async function seriesUpdatedAt(series: SeriesId, built: Date): Promise<Date> {
  const { featured, documents } = await getSeriesPageData(series);
  const scheduleUpdatedAt = featured.kind === "round" ? await getRoundUpdatedAt(series, featured.round.id) : null;
  return seriesLastModified({ scheduleUpdatedAt, documents, fallback: built });
}

// The home page, every Series page, every Round page, every Special Event, the Calendar, Alerts and About.
// FIA Document links are left out: they only redirect to the PDFs on fia.com. Telemetry pages are noindex.
// A Series whose schedule can't be read (a source down, no database locally) still gets its Series page,
// dated `built`, but no Round entries: one Series never fails the whole sitemap.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const built = new Date(BUILT_AT);
  const series = await Promise.all(
    SERIES_IDS.map(async (id) => ({
      url: absoluteUrl(`/${id}`),
      lastModified: await seriesUpdatedAt(id, built).catch((error: unknown) => {
        unstable_rethrow(error);
        console.warn(`[sitemap:${id}] Series page lastmod unavailable, using the build time: ${errorMessage(error)}`);
        return built;
      }),
      changeFrequency: "hourly" as const,
      priority: 0.9,
    })),
  );
  // Every Round the schedule loaded (this season, last season and next, when published), except a Round
  // whose every Session was cancelled: that page is noindex. lastmod is the Round's own published change.
  const rounds = (
    await Promise.all(
      SERIES_IDS.map(async (id) => {
        try {
          const [schedule, updated] = await Promise.all([listScheduleRounds(id), getScheduleUpdatedAt(id)]);
          return indexRoundPages(schedule)
            .filter((round) => !everySessionCancelled(round.sessions))
            .map((round) => ({
            url: absoluteUrl(round.path),
            lastModified: updated[round.round.id] ? new Date(updated[round.round.id]) : built,
            changeFrequency: "daily" as const,
            priority: 0.8,
          }));
        } catch (error) {
          unstable_rethrow(error);
          console.warn(`[sitemap:${id}] Rounds left out, the schedule can't be read: ${errorMessage(error)}`);
          return [];
        }
      }),
    )
  ).flat();
  // The home page shows every Series' Featured Round, so it changes when any of them does.
  const home = new Date(Math.max(built.getTime(), ...series.map((s) => s.lastModified.getTime())));
  return [
    { url: absoluteUrl("/"), lastModified: home, changeFrequency: "hourly", priority: 1 },
    ...series,
    ...rounds,
    // Hand-entered, so they change only with a deploy.
    ...listSpecialEvents().map((event) => ({
      url: absoluteUrl(`/special/${event.slug}`),
      lastModified: built,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    // Every Series' Rounds: it changes when any Series page does.
    { url: absoluteUrl("/calendar"), lastModified: home, changeFrequency: "hourly", priority: 0.8 },
    { url: absoluteUrl("/alerts"), lastModified: built, changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/about"), lastModified: built, changeFrequency: "monthly", priority: 0.3 },
  ];
}
