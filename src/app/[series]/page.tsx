import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageTransition } from "@/components/motion/page-transition";
import { RadarSlot } from "@/components/round/radar-slot";
import { RememberSeries } from "@/components/round/remember-series";
import { RoundCountdown } from "@/components/round/round-countdown";
import { RoundHero, ScheduleUnavailableHero, SeasonCompleteHero } from "@/components/round/round-hero";
import { RoundSessions } from "@/components/round/round-sessions";
import { PageStamp } from "@/components/service-worker";
import { officialResultsUrl, SERIES } from "@/domain/series";
import { SERIES_IDS } from "@/domain/types";
import { isSeriesId } from "@/lib/series-id";
import { formatRoundDates } from "@/lib/time-format";
import { getSeriesPageData } from "./data";

// The Series pages are fully static: prerendered from generateStaticParams with cached data (~5 min
// revalidation, refreshed on demand by the schedule sync). `params` is read outside <Suspense> on purpose.
// ensureStatic = "navigation" makes an unknown slug wait for its (static) render instead of getting the
// App Shell, so notFound() runs before anything streams and the response is a real 404, not a 200 shell.
// instant = false silences the dev-only App Shell validation, which does not apply to a route with no shell.
// Links to Series pages use prefetch={true} so client navigations land on the prerendered result.
export const ensureStatic = "navigation";
export const instant = false;

export async function generateStaticParams() {
  return SERIES_IDS.map((series) => ({ series }));
}

export async function generateMetadata({ params }: PageProps<"/[series]">): Promise<Metadata> {
  const { series } = await params;
  if (!isSeriesId(series)) return {};
  const info = SERIES[series];
  const { featured } = await getSeriesPageData(series);

  if (featured.kind === "unavailable") {
    const title = `${info.shortName} session times & weather`;
    const description = `${info.name} Session times in your time zone or Track Time, with the forecast for each Session.`;
    return { title, description, alternates: { canonical: `/${series}` }, openGraph: { title, description, url: `/${series}` } };
  }

  if (featured.kind === "season-complete") {
    const title = `${info.shortName} session times & weather`;
    const description = `The ${featured.season} ${info.name} season is complete. Session times and weather for ${featured.season + 1} will appear here.`;
    return { title, description, alternates: { canonical: `/${series}` }, openGraph: { title, description, url: `/${series}` } };
  }

  const { round, circuit } = featured;
  const title = `${info.shortName} ${round.name} session times & weather`;
  const description = `${info.name} ${round.name} at ${circuit.name}, ${formatRoundDates(round.startDate, round.endDate)}: every Session in your time zone or Track Time, a live countdown and the forecast for each Session.`;
  return {
    title,
    description,
    alternates: { canonical: `/${series}` },
    openGraph: { title, description, url: `/${series}` },
    twitter: { title, description },
  };
}

export default async function SeriesPage({ params }: PageProps<"/[series]">) {
  const { series } = await params;
  if (!isSeriesId(series)) notFound();

  const { featured, forecasts, results, renderedAt } = await getSeriesPageData(series);

  return (
    <PageTransition>
      <main data-series={series} className="mx-auto w-full max-w-5xl flex-1 space-y-14 px-4 pt-10 pb-20 sm:space-y-16 sm:px-6 sm:pt-16">
        <RememberSeries series={series} />
        <PageStamp at={renderedAt} />

        {featured.kind === "unavailable" ? (
          <ScheduleUnavailableHero series={series} />
        ) : featured.kind === "season-complete" ? (
          <SeasonCompleteHero series={series} season={featured.season} />
        ) : (
          <>
            <RoundHero
              series={series}
              round={featured.round}
              circuit={featured.circuit}
              countdown={
                featured.round.sessionTimesConfirmed && featured.sessions.length > 0 ? (
                  <RoundCountdown sessions={featured.sessions} circuitTimeZone={featured.circuit.timeZone} />
                ) : null
              }
            />
            {featured.round.sessionTimesConfirmed && <RadarSlot circuit={featured.circuit} sessions={featured.sessions} />}
            <RoundSessions
              series={series}
              sessions={featured.sessions}
              forecasts={forecasts}
              results={results}
              resultsUrl={officialResultsUrl(series, featured.round.season)}
              timesConfirmed={featured.round.sessionTimesConfirmed}
              circuitTimeZone={featured.circuit.timeZone}
            />
          </>
        )}
      </main>
    </PageTransition>
  );
}
