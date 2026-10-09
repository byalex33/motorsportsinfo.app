"use client";

import { CloudOffIcon } from "lucide-react";
import { SessionForecastView } from "@/components/weather/session-forecast";
import { InlineSkeleton } from "@/components/inline-skeleton";
import { SESSION_TYPE_LABELS } from "@/domain/series";
import type { ForecastResult, Session } from "@/domain/types";
import { useNow, useOnline } from "@/lib/client-stores";
import type { DisplayZone } from "@/lib/display-zone";
import { useUnitsPref } from "@/lib/prefs";
import { getRoundStatus, sessionPhase, type SessionPhase } from "@/lib/round-status";
import { formatSessionDay, formatTimeRange } from "@/lib/time-format";
import { cn } from "@/lib/utils";
import { LiveDot } from "./round-countdown";

interface SessionListProps {
  sessions: Session[];
  forecasts: Record<string, ForecastResult>;
  timesConfirmed: boolean;
  zone: DisplayZone | null;
}

export function SessionList({ sessions, forecasts, timesConfirmed, zone }: SessionListProps) {
  // Phases only need minute precision; the hero handles the per-second countdown.
  // With times TBC the start/end values are placeholders, so no live/next/finished states.
  const clock = useNow(60_000);
  const now = timesConfirmed ? clock : null;
  const status = now !== null ? getRoundStatus(sessions, now) : null;
  const nextId = status?.kind === "upcoming" ? status.session.id : null;

  return (
    <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {sessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          forecast={forecasts[session.id]}
          timesConfirmed={timesConfirmed}
          zone={zone}
          phase={now === null ? (session.status === "cancelled" ? "cancelled" : null) : sessionPhase(session, now)}
          isNext={session.id === nextId}
        />
      ))}
    </ol>
  );
}

function SessionRow({
  session,
  forecast,
  timesConfirmed,
  zone,
  phase,
  isNext,
}: {
  session: Session;
  forecast: ForecastResult | undefined;
  timesConfirmed: boolean;
  zone: DisplayZone | null;
  phase: SessionPhase | null;
  isNext: boolean;
}) {
  const cancelled = session.status === "cancelled";
  const live = phase === "live";
  const finished = phase === "finished";
  const day = timesConfirmed && zone ? formatSessionDay(session.startsAt, zone.tz) : null;
  const range =
    timesConfirmed && zone
      ? formatTimeRange(session.startsAt, session.endsAt, zone.tz, undefined, { endEstimated: session.endIsEstimated })
      : null;

  return (
    <li
      className={cn(
        "relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,auto)] sm:px-5",
        live && "bg-series-accent/[0.07]",
        finished && "opacity-65",
      )}
    >
      {live && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-series-accent" />}

      <DateTile day={day} timesConfirmed={timesConfirmed} muted={cancelled} />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className={cn("font-semibold tracking-tight", cancelled && "text-muted-foreground")}>{session.name}</h3>
          {cancelled && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive dark:bg-destructive/20">
              Cancelled
            </span>
          )}
          {live && !cancelled && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-series-accent px-2 py-0.5 text-xs font-bold tracking-wide text-series-accent-foreground uppercase">
              <LiveDot className="size-1.5" />
              Live
            </span>
          )}
          {isNext && !live && (
            <span className="rounded-full border border-series-accent/50 bg-series-accent/10 px-2 py-0.5 text-xs font-semibold text-series-accent">
              Up next
            </span>
          )}
          {finished && !cancelled && <span className="text-xs font-medium text-muted-foreground">Finished</span>}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span>{SESSION_TYPE_LABELS[session.type]}</span>
          <span aria-hidden>·</span>
          {!timesConfirmed ? (
            <span className="font-medium">Time TBC</span>
          ) : range ? (
            <span className={cn("font-mono text-[0.8rem] font-medium text-foreground tabular", cancelled && "text-muted-foreground line-through")}>
              {cancelled && <span className="sr-only">Was </span>}
              {range}
            </span>
          ) : (
            <InlineSkeleton className="h-4 w-28" />
          )}
        </p>
      </div>

      {timesConfirmed && !cancelled && (
        <div className="col-start-2 min-w-0 sm:col-start-auto sm:justify-self-end">
          <ForecastSlot forecast={forecast} timeZone={zone?.tz ?? null} />
        </div>
      )}
    </li>
  );
}

function DateTile({ day, timesConfirmed, muted }: { day: ReturnType<typeof formatSessionDay> | null; timesConfirmed: boolean; muted: boolean }) {
  return (
    <div
      className={cn(
        "flex w-13 flex-col items-center justify-center rounded-xl border border-border bg-background py-1.5 text-center",
        muted && "opacity-60",
      )}
      aria-hidden={!day}
    >
      {!timesConfirmed ? (
        <span className="py-2 text-xs font-bold tracking-wider text-muted-foreground">TBC</span>
      ) : day ? (
        <>
          <span className="text-[0.65rem] font-bold tracking-widest text-series-accent uppercase">{day.weekday}</span>
          <span className="font-mono text-xl leading-tight font-semibold tabular">{day.day}</span>
          <span className="text-[0.65rem] font-medium text-muted-foreground uppercase">{day.month}</span>
          <span className="sr-only">{day.long}</span>
        </>
      ) : (
        <span className="flex flex-col items-center gap-1 py-0.5">
          <InlineSkeleton className="h-2.5 w-7" />
          <InlineSkeleton className="h-5 w-6" />
          <InlineSkeleton className="h-2.5 w-7" />
        </span>
      )}
    </div>
  );
}

function ForecastSlot({ forecast, timeZone }: { forecast: ForecastResult | undefined; timeZone: string | null }) {
  const online = useOnline();
  const units = useUnitsPref();

  if (!online) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <CloudOffIcon className="size-3.5" aria-hidden />
        Weather unavailable offline
      </span>
    );
  }
  if (!units.ready || !timeZone) return <InlineSkeleton className="h-5 w-36" />;
  return (
    <div className="text-sm">
      <SessionForecastView
        forecast={forecast ?? { kind: "unavailable" }}
        tempUnit={units.value.temp}
        windUnit={units.value.wind}
        timeZone={timeZone}
      />
    </div>
  );
}
