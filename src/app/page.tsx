import { Suspense } from "react";
import { JsonLd } from "@/components/json-ld";
import { PageTransition } from "@/components/motion/page-transition";
import { RevealWords } from "@/components/motion/reveal-words";
import { SeriesPicker } from "@/components/series-picker";
import { SERIES_IDS, type SeriesId } from "@/domain/types";
import { ENTER, enterDelay } from "@/lib/motion";
import { homeJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { toSeriesSummary, type SeriesSummary } from "@/lib/series-summary";
import { getSeriesPageData } from "./[series]/data";

export const metadata = pageMetadata({
  title: "motorsportsinfo.app — session times & weather for F1, F2, F3, WEC, Formula E, IndyCar and MotoGP",
  absoluteTitle: true,
  description:
    "The next Round of F1, F2, F3, WEC, Formula E, IndyCar and MotoGP: every Session in your time zone, with a live countdown and the forecast for each Session.",
  path: "/",
});

/**
 * Each Series' Featured Round and remaining Sessions. Reads the same cached entries as the Series
 * pages (and the sitemap), so the home page is prerendered and refreshed with them at no extra cost.
 * One Series at a time: on a cold cache, Series racing at the same Circuit share in-process forecast
 * fetches, and a "use cache" scope must not await a fetch another scope started.
 */
async function seriesSummaries(): Promise<Partial<Record<SeriesId, SeriesSummary>>> {
  const summaries: Partial<Record<SeriesId, SeriesSummary>> = {};
  for (const id of SERIES_IDS) {
    const { featured, renderedAt } = await getSeriesPageData(id);
    summaries[id] = toSeriesSummary(featured, renderedAt);
  }
  return summaries;
}

/** The Series list with each Featured Round. Prerendered with the page from cached data. */
async function SeriesList() {
  return <SeriesPicker summaries={await seriesSummaries()} />;
}

export default function HomePage() {
  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-10 pb-20 sm:px-6 sm:pt-16">
        <JsonLd data={homeJsonLd()} />
        <p className="eyebrow enter-rise flex items-center gap-2 text-muted-foreground" style={enterDelay(ENTER.eyebrow)}>
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          Session times &amp; weather
        </p>
        <h1 className="mt-4 max-w-3xl text-[2.25rem] leading-[1.05] font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
          <RevealWords text="The next Round of every Series, in your time." />
        </h1>
        <p className="enter-rise mt-5 max-w-2xl leading-relaxed text-pretty text-muted-foreground sm:text-lg" style={enterDelay(ENTER.lead)}>
          F1, F2, F3, WEC, Formula E, IndyCar and MotoGP: pick a Series for every Session of its next Round in your time
          zone or Track Time, with a live countdown and the forecast at the Circuit.
        </p>
        <nav aria-label="All Series" className="mt-10 sm:mt-14">
          {/* Only seen on a cold cache: every Series without its Featured Round, until that arrives. */}
          <Suspense fallback={<SeriesPicker />}>
            <SeriesList />
          </Suspense>
        </nav>
      </main>
    </PageTransition>
  );
}
