import { notFound } from "next/navigation";
import { OG_CONTENT_TYPE, OG_SIZE, seriesOgImage } from "@/lib/seo/og-image";
import { seriesOgText } from "@/lib/seo/og-text";
import { isSeriesId } from "@/lib/series-id";
import { featuredRoundStaticParams, getRoundPageData } from "./data";

// The Round's card. A page that sets its own openGraph metadata does not inherit the Series image.
// It reads the page's cached data, so it refreshes with the page.
export const alt = "The Round with its Circuit, dates and next Session time";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export async function generateStaticParams() {
  return featuredRoundStaticParams();
}

export default async function Image({ params }: { params: Promise<{ series: string; season: string; round: string }> }) {
  const { series, season, round } = await params;
  const year = /^\d{4}$/.test(season) ? Number(season) : null;
  if (!isSeriesId(series) || year === null) notFound();
  const data = await getRoundPageData(series, year, round.toLowerCase());
  if (!data) notFound();
  return seriesOgImage(
    series,
    seriesOgText(series, { kind: "round", round: data.round, roundNumber: data.roundNumber, circuit: data.circuit, sessions: data.sessions }, Date.parse(data.renderedAt)),
  );
}
