import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageTransition } from "@/components/motion/page-transition";
import { RadarSlot } from "@/components/round/radar-slot";
import { RememberSeries } from "@/components/round/remember-series";
import { RoundCountdown } from "@/components/round/round-countdown";
import { RoundDocuments } from "@/components/round/round-documents";
import { RoundHero, ScheduleUnavailableHero, SeasonCompleteHero } from "@/components/round/round-hero";
import { RoundSessions } from "@/components/round/round-sessions";
import { PageStamp } from "@/components/service-worker";
import { officialResultsUrl, SERIES } from "@/domain/series";
import { SERIES_IDS, type SeriesId } from "@/domain/types";
import { JsonLd } from "@/components/json-ld";
import { calendarFeedPath } from "@/server/alerts/selection";
import { roundDisplayName, roundEventName, roundJsonLd, seriesBreadcrumbJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { absoluteUrl } from "@/lib/site";
import { DATA_CREDITS } from "@/lib/data-credits";
import { trackTimeTexts } from "@/lib/track-time";
import { isSeriesId } from "@/lib/series-id";
import { formatRoundDates } from "@/lib/time-format";
import { getSeriesPageData, type SeriesFeatured } from "./data";

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

/** Search-facing title and description for a Series page, aimed at "<series> <round> <year> schedule" searches. */
function seriesSeo(series: SeriesId, featured: SeriesFeatured): { title: string; description: string } {
  const info = SERIES[series];
  if (featured.kind === "unavailable") {
    return {
      title: `${info.shortName} session times & weather in your time zone`,
      description: `${info.name} Session times in your time zone or Track Time, with the forecast for each Session.`,
    };
  }
  if (featured.kind === "season-complete") {
    return {
      title: `${info.shortName} ${featured.season} season complete – session times & weather`,
      description: `The ${featured.season} ${info.name} season is complete. Session times and weather for ${featured.season + 1} will appear here, in your time zone.`,
    };
  }
  const { round, circuit } = featured;
  const name = roundEventName(series, round, circuit);
  const dates = formatRoundDates(round.startDate, round.endDate);
  if (!round.sessionTimesConfirmed) {
    return {
      title: `${name} schedule – dates, times TBC & weather`,
      description: `${roundDisplayName(series, round, circuit)}, ${dates} at ${circuit.name}. ${info.shortName} Session times are TBC; they appear here in your time zone, with the forecast, once published.`,
    };
  }
  return {
    title: `${name} – session times & weather`,
    description: `${roundDisplayName(series, round, circuit)}, ${dates} at ${circuit.name}: every ${info.shortName} Session in your time zone or Track Time, with countdown and weather.`,
  };
}

/** The calendar feed of this Series' default Session Types, offered as the page's text/calendar alternate. */
function calendarAlternate(series: SeriesId): string | null {
  return calendarFeedPath({ [series]: SERIES[series].defaultReminderTypes });
}

export async function generateMetadata({ params }: PageProps<"/[series]">): Promise<Metadata> {
  const { series } = await params;
  if (!isSeriesId(series)) return {};
  const { featured } = await getSeriesPageData(series);
  const { title, description } = seriesSeo(series, featured);
  const calendar = calendarAlternate(series);
  return pageMetadata({
    title,
    description,
    path: `/${series}`,
    absoluteTitle: true,
    alternates: calendar ? { types: { "text/calendar": calendar } } : undefined,
  });
}

export default async function SeriesPage({ params }: PageProps<"/[series]">) {
  const { series } = await params;
  if (!isSeriesId(series)) notFound();

  const { featured, forecasts, results, documents, renderedAt } = await getSeriesPageData(series);
  const trackTimes = featured.kind === "round" ? trackTimeTexts(featured.sessions, featured.circuit.timeZone) : {};
  const structuredData =
    featured.kind === "round"
      ? [
          roundJsonLd({
            series,
            round: featured.round,
            circuit: featured.circuit,
            sessions: featured.sessions,
            description: seriesSeo(series, featured).description,
            imageUrl: absoluteUrl(`/${series}/opengraph-image`),
          }),
          seriesBreadcrumbJsonLd(series),
        ]
      : [seriesBreadcrumbJsonLd(series)];

  return (
    <PageTransition>
      <main data-series={series} className="mx-auto w-full max-w-5xl flex-1 space-y-14 px-4 pt-10 pb-20 sm:space-y-16 sm:px-6 sm:pt-16">
        <JsonLd data={structuredData} />
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
              roundNumber={featured.roundNumber}
              circuit={featured.circuit}
              countdown={
                featured.round.sessionTimesConfirmed && featured.sessions.length > 0 ? (
                  <RoundCountdown
                    sessions={featured.sessions}
                    circuitTimeZone={featured.circuit.timeZone}
                    trackTimes={trackTimes}
                    renderedAt={renderedAt}
                  />
                ) : null
              }
            />
            {SERIES[series].hasRainRadar && featured.round.sessionTimesConfirmed && (
              <RadarSlot circuit={featured.circuit} sessions={featured.sessions} />
            )}
            <RoundSessions
              credit={DATA_CREDITS[series]}
              sessions={featured.sessions}
              forecasts={forecasts}
              results={results}
              resultsUrl={officialResultsUrl(series, featured.round.season)}
              timesConfirmed={featured.round.sessionTimesConfirmed}
              circuitTimeZone={featured.circuit.timeZone}
              trackTimes={trackTimes}
            />
            {documents && <RoundDocuments series={series} documents={documents} circuitTimeZone={featured.circuit.timeZone} />}
          </>
        )}
      </main>
    </PageTransition>
  );
}
