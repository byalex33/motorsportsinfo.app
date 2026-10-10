import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { SERIES_IDS } from "@/domain/types";
import { absoluteUrl } from "@/lib/site";
import { getSeriesPageData } from "./[series]/data";

/** When this deployment was built (first rendered, then cached for good). Pages without data change only with a deploy. */
async function builtAt(): Promise<string> {
  "use cache";
  cacheLife("max");
  return new Date().toISOString();
}

// The home page, every Series page, Alerts and About. FIA Document viewer pages are left out: they
// last only while their Round is featured and are noindex (the FIA's own pages are the source).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const built = new Date(await builtAt());
  // A Series page changes when its cached data is re-rendered (schedule sync, forecasts). This reads
  // the same cache entry the page does, so it costs nothing extra.
  const series = await Promise.all(
    SERIES_IDS.map(async (id) => ({
      url: absoluteUrl(`/${id}`),
      lastModified: new Date((await getSeriesPageData(id)).renderedAt),
      changeFrequency: "hourly" as const,
      priority: 0.9,
    })),
  );
  return [
    { url: absoluteUrl("/"), lastModified: built, changeFrequency: "weekly", priority: 1 },
    ...series,
    { url: absoluteUrl("/alerts"), lastModified: built, changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/about"), lastModified: built, changeFrequency: "monthly", priority: 0.3 },
  ];
}
