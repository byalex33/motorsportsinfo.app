import type { Metadata } from "next";
import Link from "next/link";
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
import { everySessionCancelled } from "@/lib/round-status";
import { absoluteUrl } from "@/lib/site";
import { isSeriesId } from "@/lib/series-id";
import { calendarFeedPath } from "@/server/alerts/selection";
import { getSeriesPageData } from "../../data";
import { featuredRoundStaticParams, getRoundPageData, getRoundPageRedirect } from "./data";

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

/**
 * The Round, or a 308 to the Round the slug most likely meant (an old collision suffix, an old link from
 * before a rename, the other source's name, the Circuit id), or a 404.
 */
async function loadRoundPage(series: SeriesId, season: number, pageSlug: string) {
  const data = await getRoundPageData(series, season, pageSlug);
  if (data) return data;
  const redirectTo = await getRoundPageRedirect(series, season, pageSlug);
  if (redirectTo) permanentRedirect(redirectTo);
  notFound();
}

export async function generateMetadata({ params }: PageProps<"/[series]/[season]/[round]">): Promise<Metadata> {
  const raw = await params;
  const { series, season, round } = canonicalRoundParams(raw.series, raw.season, raw.round);
  const data = await loadRoundPage(series, season, round);
  const cancelled = everySessionCancelled(data.sessions);
  const { title, description } = roundPageSeo(series, data.round, data.circuit, data.pageSlug, cancelled, data.renderedAt);
  const calendar = calendarFeedPath({ [series]: SERIES[series].defaultReminderTypes });
  return pageMetadata({
    title,
    description,
    path: data.path,
    absoluteTitle: true,
    // A cancelled Round keeps a page so the old URL does not 404, but it is not a result to index.
    robots: cancelled ? { index: false, follow: true } : undefined,
    alternates: calendar ? { types: { "text/calendar": calendar } } : undefined,
  });
}

export default async function RoundPage({ params }: PageProps<"/[series]/[season]/[round]">) {
  const raw = await params;
  const { series, season, round: pageSlug } = canonicalRoundParams(raw.series, raw.season, raw.round);
  const [data, { featured }] = await Promise.all([loadRoundPage(series, season, pageSlug), getSeriesPageData(series)]);

  const { round, circuit, sessions, forecasts, results, documents, renderedAt, path } = data;
  // The Results route and the Telemetry pages only know the Featured Round's Sessions (they are looked up
  // by Session slug, "race"). On any other Round the chips would open the Featured Round's data, so its
  // RESULTS chips link to the official results instead and there is no TELEMETRY chip.
  const isFeatured = featured.kind === "round" && featured.round.id === round.id;
  const seo = roundPageSeo(series, round, circuit, data.pageSlug, everySessionCancelled(sessions), renderedAt);
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
          results={isFeatured ? results : []}
          showTelemetry={isFeatured}
          documents={documentsForRound}
          renderedAt={renderedAt}
          lead={seo.lead}
          finishedNote={
            <>
              See the{" "}
              <Link href={`/${series}`} className="underline underline-offset-4 transition-colors hover:text-foreground">
                {SERIES[series].shortName} page
              </Link>{" "}
              for the next Round.
            </>
          }
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
