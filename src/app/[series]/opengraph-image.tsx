import { notFound } from "next/navigation";
import { SERIES_IDS } from "@/domain/types";
import { OG_CONTENT_TYPE, OG_SIZE, seriesOgImage } from "@/lib/seo/og-image";
import { seriesOgText } from "@/lib/seo/og-text";
import { isSeriesId } from "@/lib/series-id";
import { getSeriesPageData } from "./data";

// The Series page's card: Featured Round, Circuit, dates and the next Session in UTC. It reads the
// page's own cached data (tagged series:<id>), so it refreshes with the page when the schedule sync
// revalidates it or the ~5 minute cache life runs out.
export const alt = "The Featured Round with its Circuit, dates and next Session time";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export async function generateStaticParams() {
  return SERIES_IDS.map((series) => ({ series }));
}

export default async function Image({ params }: { params: Promise<{ series: string }> }) {
  const { series } = await params;
  if (!isSeriesId(series)) notFound();
  const { featured, renderedAt } = await getSeriesPageData(series);
  return seriesOgImage(series, seriesOgText(series, featured, Date.parse(renderedAt)));
}
