import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { SERIES_IDS, type SeriesId } from "@/domain/types";
import { seriesLastModified } from "@/lib/seo/last-modified";
import { indexRoundPages } from "@/lib/seo/round-page";
import { absoluteUrl } from "@/lib/site";
import { getRoundUpdatedAt, getScheduleUpdatedAt, listScheduleRounds, listSpecialEvents } from "@/server/schedule";
import { getSeriesPageData } from "./[series]/data";

/** When this deployment was built (first rendered, then cached for good). Pages without data change only with a deploy. */
async function builtAt(): Promise<string> {
  "use cache";
  cacheLife("max");
  return new Date().toISOString();
}

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
// FIA Document viewer pages are left out: they last only while their Round is featured and are noindex
// (the FIA's own pages are the source). Telemetry pages are noindex too.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const built = new Date(await builtAt());
  const series = await Promise.all(
    SERIES_IDS.map(async (id) => ({
      url: absoluteUrl(`/${id}`),
      lastModified: await seriesUpdatedAt(id, built),
      changeFrequency: "hourly" as const,
      priority: 0.9,
    })),
  );
  // Every Round the schedule loaded (this season, last season and next, when published). lastmod is the
  // Round's own published change, not the render time.
  const rounds = (
    await Promise.all(
      SERIES_IDS.map(async (id) => {
        const [schedule, updated] = await Promise.all([listScheduleRounds(id), getScheduleUpdatedAt(id)]);
        return indexRoundPages(schedule).map((round) => ({
          url: absoluteUrl(round.path),
          lastModified: updated[round.round.id] ? new Date(updated[round.round.id]) : built,
          changeFrequency: "daily" as const,
          priority: 0.8,
        }));
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
