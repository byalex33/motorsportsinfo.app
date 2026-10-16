import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageTransition } from "@/components/motion/page-transition";
import { RememberSeries } from "@/components/round/remember-series";
import { RoundDetail } from "@/components/round/round-detail";
import { PageStamp } from "@/components/service-worker";
import { SERIES } from "@/domain/series";
import type { SeriesId } from "@/domain/types";
import { roundBreadcrumbJsonLd, roundEventName, roundJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { roundPagePath, roundPageSeo } from "@/lib/seo/round-page";
import { absoluteUrl } from "@/lib/site";
import { isSeriesId } from "@/lib/series-id";
import { calendarFeedPath } from "@/server/alerts/selection";
import { featuredRoundStaticParams, getRoundPageData } from "./data";

// Static like the Series pages. Only the Featured Round of each Series is prerendered; every other Round
// is rendered on its first request and kept. ensureStatic = "navigation" makes an unknown Round wait for
// that render, so notFound() is a real 404 rather than a 200 shell. instant = false: there is no App Shell.
// See src/app/[series]/page.tsx.
export const ensureStatic = "navigation";
export const instant = false;

export async function generateStaticParams() {
  return featuredRoundStaticParams();
}

/** A 4-digit season and a lowercase Series and slug. Anything else redirects to that form, or 404s. */
function canonicalRoundParams(series: string, season: string, round: string): { series: SeriesId; season: number; round: string } {
  const lower = series.toLowerCase();
  const seriesId = isSeriesId(series) ? series : isSeriesId(lower) ? lower : null;
  const year = /^\d{4}$/.test(season) ? Number(season) : null;
  const slug = round.toLowerCase();
  if (!seriesId || year === null) notFound();
  if (series !== seriesId || season !== String(year) || round !== slug) permanentRedirect(roundPagePath(seriesId, year, slug));
  return { series: seriesId, season: year, round: slug };
}

export async function generateMetadata({ params }: PageProps<"/[series]/[season]/[round]">): Promise<Metadata> {
  const raw = await params;
  const { series, season, round } = canonicalRoundParams(raw.series, raw.season, raw.round);
  const data = await getRoundPageData(series, season, round);
  // notFound() here as well as in the page: with ensureStatic, a 404 whose metadata resolved normally keeps
  // the root layout's title instead of not-found.tsx's "Page not found".
  if (!data) notFound();
  const { title, description } = roundPageSeo(series, data.round, data.circuit, data.pageSlug);
  const calendar = calendarFeedPath({ [series]: SERIES[series].defaultReminderTypes });
  return pageMetadata({
    title,
    description,
    path: data.path,
    absoluteTitle: true,
    alternates: calendar ? { types: { "text/calendar": calendar } } : undefined,
  });
}

export default async function RoundPage({ params }: PageProps<"/[series]/[season]/[round]">) {
  const raw = await params;
  const { series, season, round: pageSlug } = canonicalRoundParams(raw.series, raw.season, raw.round);
  const data = await getRoundPageData(series, season, pageSlug);
  if (!data) notFound();

  const { round, circuit, sessions, forecasts, results, documents, renderedAt, path } = data;
  const seo = roundPageSeo(series, round, circuit, data.pageSlug);
  // A Round page for a past Round has no FIA listing of its own (fia.com shows the current Round). Hide
  // the empty state there; still show a failure to load, and the documents when they match this Round.
  const documentsForRound = documents?.kind === "none" ? null : documents;
  const name = roundEventName(series, round, circuit);

  return (
    <PageTransition>
      <main data-series={series} className="mx-auto w-full max-w-5xl flex-1 space-y-14 px-4 pt-10 pb-20 sm:space-y-16 sm:px-6 sm:pt-16">
        <JsonLd
          data={[
            roundJsonLd({
              series,
              round,
              circuit,
              sessions,
              description: seo.description,
              pageUrl: absoluteUrl(path),
              imageUrl: absoluteUrl(`${path}/opengraph-image`),
            }),
            roundBreadcrumbJsonLd(series, name, path),
          ]}
        />
        <RememberSeries series={series} />
        <PageStamp at={renderedAt} />
        <RoundDetail
          series={series}
          round={round}
          roundNumber={data.roundNumber}
          circuit={circuit}
          sessions={sessions}
          forecasts={forecasts}
          results={results}
          documents={documentsForRound}
          renderedAt={renderedAt}
          lead={seo.lead}
          preamble={
            <Breadcrumbs
              items={[
                { name: "Home", href: "/" },
                { name: SERIES[series].shortName, href: `/${series}` },
                { name },
              ]}
            />
          }
        />
      </main>
    </PageTransition>
  );
}
