"use client";

import Link from "next/link";
import { CalendarClockIcon } from "lucide-react";
import type { ForecastResult, Session } from "@/domain/types";
import { DisplayControls } from "./display-controls";
import { SessionList } from "./session-list";
import { useDisplayZone } from "./use-display-zone";

interface RoundSessionsProps {
  sessions: Session[];
  forecasts: Record<string, ForecastResult>;
  timesConfirmed: boolean;
  circuitTimeZone: string;
}

/** Display controls and the Round's Sessions in order, cancelled ones included. */
export function RoundSessions({ sessions, forecasts, timesConfirmed, circuitTimeZone }: RoundSessionsProps) {
  const zone = useDisplayZone(circuitTimeZone);

  return (
    <section aria-labelledby="sessions-heading" className="space-y-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="sessions-heading" className="eyebrow text-muted-foreground">
          Sessions
        </h2>
        {timesConfirmed && sessions.length > 0 && (
          <p className="eyebrow text-muted-foreground tabular">
            {sessions.length} Session{sessions.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {timesConfirmed && <DisplayControls zone={zone} />}

      {!timesConfirmed && (
        <p className="flex gap-3 border-l-2 border-series-accent py-0.5 pl-3 text-sm leading-relaxed">
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
        <SessionList sessions={sessions} forecasts={forecasts} timesConfirmed={timesConfirmed} zone={zone} />
      ) : (
        timesConfirmed && (
          <p className="border-y border-border py-10 text-center text-sm text-muted-foreground">
            The Session list for this Round has not been published yet.
          </p>
        )
      )}

      {/* Credits required by the data licences (ADR 0001). The radar map credits its own sources. */}
      <p className="text-center font-mono text-[0.6875rem] tracking-[0.04em] text-muted-foreground">
        <a className="hover:text-foreground" href="https://openf1.org" target="_blank" rel="noopener noreferrer">
          Data: OpenF1
        </a>
        {" · "}
        <a className="hover:text-foreground" href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
          Weather data by Open-Meteo.com
        </a>
        {" · "}
        <Link className="hover:text-foreground" href="/about">
          About
        </Link>
      </p>
    </section>
  );
}
