"use client";

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
    <section aria-labelledby="sessions-heading" className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <h2 id="sessions-heading" className="text-xl font-bold tracking-tight sm:text-2xl">
          Sessions
        </h2>
        {timesConfirmed && sessions.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {sessions.length} Session{sessions.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {timesConfirmed && <DisplayControls zone={zone} />}

      {!timesConfirmed && (
        <div className="flex gap-3 rounded-2xl border border-dashed border-series-accent/40 bg-series-accent/5 p-4 text-sm">
          <CalendarClockIcon className="mt-0.5 size-5 shrink-0 text-series-accent" aria-hidden />
          <p>
            <span className="font-semibold">Times TBC.</span>{" "}
            <span className="text-muted-foreground">
              The dates are set but Session times have not been published yet. They will appear here, with forecasts,
              as soon as they are.
            </span>
          </p>
        </div>
      )}

      {sessions.length > 0 ? (
        <SessionList sessions={sessions} forecasts={forecasts} timesConfirmed={timesConfirmed} zone={zone} />
      ) : (
        timesConfirmed && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            The Session list for this Round has not been published yet.
          </div>
        )
      )}
    </section>
  );
}
