"use client";

import Link from "next/link";
import { CalendarClockIcon } from "lucide-react";
import type { ForecastResult, SeriesId, Session } from "@/domain/types";
import { DATA_CREDITS } from "@/lib/data-credits";
import { ENTER, enterDelay } from "@/lib/motion";
import type { TrackTimeText } from "@/lib/track-time";
import { DisplayControls } from "./display-controls";
import { SessionList } from "./session-list";
import { useDisplayZone } from "./use-display-zone";

interface RoundSessionsProps {
  series: SeriesId;
  sessions: Session[];
  forecasts: Record<string, ForecastResult>;
  /** Ids of the finished Sessions with a Session Result. The classification itself loads on reveal. */
  results: string[];
  /** Linked from finished Sessions that have no Session Result. */
  resultsUrl: string;
  timesConfirmed: boolean;
  circuitTimeZone: string;
  /** Server-rendered Track Time text per Session, shown until the viewer's zone is known. */
  trackTimes: Record<string, TrackTimeText>;
}

/** Display controls and the Round's Sessions in order, cancelled ones included. */
export function RoundSessions({
  series,
  sessions,
  forecasts,
  results,
  resultsUrl,
  timesConfirmed,
  circuitTimeZone,
  trackTimes,
}: RoundSessionsProps) {
  const zone = useDisplayZone(circuitTimeZone);

  return (
    <section aria-labelledby="sessions-heading" className="space-y-5">
      <div className="enter-rise flex items-baseline justify-between gap-4" style={enterDelay(ENTER.body)}>
        <h2 id="sessions-heading" className="eyebrow text-muted-foreground">
          Sessions
        </h2>
        {timesConfirmed && sessions.length > 0 && (
          <p className="eyebrow text-muted-foreground tabular">
            {sessions.length} Session{sessions.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {timesConfirmed && (
        <div className="enter-rise" style={enterDelay(ENTER.body + 15)}>
          <DisplayControls zone={zone} circuitTimeZone={circuitTimeZone} />
        </div>
      )}

      {!timesConfirmed && (
        <p className="enter-rise flex gap-3 border-l-2 border-series-accent py-0.5 pl-3 text-sm leading-relaxed" style={enterDelay(ENTER.body + 15)}>
          <CalendarClockIcon className="mt-0.5 size-4 shrink-0 text-series-accent" aria-hidden />
          <span>
            <span className="font-medium">Times TBC.</span>{" "}
            <span className="text-muted-foreground">
              The dates are set but Session times have not been published yet. They will appear here, with forecasts,
              as soon as they are.
            </span>
          </span>
        </p>
      )}

      {sessions.length > 0 ? (
        <SessionList
          sessions={sessions}
          forecasts={forecasts}
          results={results}
          resultsUrl={resultsUrl}
          timesConfirmed={timesConfirmed}
          zone={zone}
          circuitTimeZone={circuitTimeZone}
          trackTimes={trackTimes}
        />
      ) : (
        timesConfirmed && (
          <p className="enter-rise border-y border-border py-10 text-center text-sm text-muted-foreground" style={enterDelay(ENTER.rows)}>
            The Session list for this Round has not been published yet.
          </p>
        )
      )}

      {/* Credits required by the data licences (ADR 0001). The radar map credits its own sources. */}
      <p className="enter-fade text-center font-mono text-[0.6875rem] tracking-[0.04em] text-muted-foreground" style={enterDelay(ENTER.rows + 120)}>
        <a className="transition-colors hover:text-foreground" href={DATA_CREDITS[series].href} target="_blank" rel="noopener noreferrer">
          Data: {DATA_CREDITS[series].label}
        </a>
        {" · "}
        <a className="transition-colors hover:text-foreground" href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
          Weather data by Open-Meteo.com
        </a>
        {" · "}
        <Link className="transition-colors hover:text-foreground" href="/about">
          About
        </Link>
      </p>
    </section>
  );
}
