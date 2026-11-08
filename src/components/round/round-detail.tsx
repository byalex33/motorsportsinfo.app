import type { ReactNode } from "react";
import { RadarSlot } from "@/components/round/radar-slot";
import { RoundCountdown } from "@/components/round/round-countdown";
import { RoundDocuments } from "@/components/round/round-documents";
import { RoundHero } from "@/components/round/round-hero";
import { RoundSessions } from "@/components/round/round-sessions";
import { officialResultsUrl, SERIES } from "@/domain/series";
import type { Circuit, ForecastResult, Round, RoundDocumentsResult, SeriesId, Session } from "@/domain/types";
import { DATA_CREDITS } from "@/lib/data-credits";
import { trackTimeTexts } from "@/lib/track-time";

/**
 * The Round a Series page and a Round page both show: hero, radar, Sessions, FIA Documents.
 * Session Results stay behind the RESULTS chip (RoundSessions); this never renders a classification.
 */
export function RoundDetail({
  series,
  round,
  roundNumber,
  circuit,
  sessions,
  forecasts,
  results,
  showTelemetry = true,
  documents,
  renderedAt,
  lead,
  finishedNote,
  preamble,
}: {
  series: SeriesId;
  round: Round;
  roundNumber: number | null;
  circuit: Circuit;
  sessions: Session[];
  forecasts: Record<string, ForecastResult>;
  results: string[];
  /** False on a Round page for a Round that is not featured: the Telemetry pages only know the Featured Round. */
  showTelemetry?: boolean;
  documents: RoundDocumentsResult | null;
  renderedAt: string;
  lead?: string;
  /** Shown after "Round complete." once every Session has finished. The Series page keeps the default. */
  finishedNote?: ReactNode;
  /** Breadcrumbs, sitting with the hero so the page's section gap stays below them. */
  preamble?: ReactNode;
}) {
  const trackTimes = trackTimeTexts(sessions, circuit.timeZone);

  return (
    <>
      <div className="space-y-8">
        {preamble}
        <RoundHero
          round={round}
          roundNumber={roundNumber}
          circuit={circuit}
          lead={lead}
          countdown={
            round.sessionTimesConfirmed && sessions.length > 0 ? (
              <RoundCountdown
                sessions={sessions}
                circuitTimeZone={circuit.timeZone}
                trackTimes={trackTimes}
                renderedAt={renderedAt}
                finishedNote={finishedNote}
              />
            ) : null
          }
        />
      </div>
      {SERIES[series].hasRainRadar && round.sessionTimesConfirmed && <RadarSlot circuit={circuit} sessions={sessions} />}
      <RoundSessions
        credit={DATA_CREDITS[series]}
        sessions={sessions}
        forecasts={forecasts}
        results={results}
        showTelemetry={showTelemetry}
        resultsUrl={officialResultsUrl(series, round.season)}
        timesConfirmed={round.sessionTimesConfirmed}
        circuitTimeZone={circuit.timeZone}
        trackTimes={trackTimes}
      />
      {documents && <RoundDocuments series={series} documents={documents} circuitTimeZone={circuit.timeZone} />}
    </>
  );
}
