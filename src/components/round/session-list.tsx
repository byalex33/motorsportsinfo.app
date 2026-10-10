"use client";

import Link from "next/link";
import { ActivityIcon, CloudOffIcon } from "lucide-react";
import { SessionForecastView } from "@/components/weather/session-forecast";
import { InlineSkeleton } from "@/components/inline-skeleton";
import type { ForecastResult, Session, SessionResult } from "@/domain/types";
import { useNow, useOnline } from "@/lib/client-stores";
import type { DisplayZone } from "@/lib/display-zone";
import { staggerDelay } from "@/lib/motion";
import { useUnitsPref } from "@/lib/prefs";
import { getRoundStatus, sessionPhase, type SessionPhase } from "@/lib/round-status";
import { sessionSlug } from "@/lib/session-slug";
import { formatSessionDay, formatTimeRange, zoneOffsetLabel } from "@/lib/time-format";
import type { TrackTimeText } from "@/lib/track-time";
import { cn } from "@/lib/utils";
import { LiveDot } from "./round-countdown";
import { SessionResultsDialog } from "./session-results-dialog";

interface SessionListProps {
  sessions: Session[];
  forecasts: Record<string, ForecastResult>;
  results: Record<string, SessionResult>;
  resultsUrl: string;
  timesConfirmed: boolean;
  /** Null on the server and during hydration: rows then show the server's Track Time text. */
  zone: DisplayZone | null;
  circuitTimeZone: string;
  trackTimes: Record<string, TrackTimeText>;
}

// Columns on wider screens: day · Session · time · weather. Rows use subgrid so every column lines up.
const COLS = "sm:grid sm:grid-cols-[4.5rem_minmax(0,1fr)_auto_auto] sm:gap-x-6";
const ROW = "sm:col-span-4 sm:grid-cols-subgrid";

export function SessionList({ sessions, forecasts, results, resultsUrl, timesConfirmed, zone, circuitTimeZone, trackTimes }: SessionListProps) {
  // Phases only need minute precision; the hero handles the per-second countdown.
  // With times TBC the start/end values are placeholders, so no live/next/finished states.
  const clock = useNow(60_000);
  const now = timesConfirmed ? clock : null;
  const status = now !== null ? getRoundStatus(sessions, now) : null;
  const nextId = status?.kind === "upcoming" ? status.session.id : null;
  const first = sessions[0];
  const offset = timesConfirmed && first ? (zone ? zoneOffsetLabel(zone.tz, new Date(first.startsAt)) : (trackTimes[first.id]?.offset ?? null)) : null;

  return (
    <ol className={cn("divide-y divide-border border-y border-border", COLS)}>
      <li aria-hidden className={cn("eyebrow enter-rise hidden py-2.5 text-muted-foreground sm:grid", ROW)} style={staggerDelay(0)}>
        <span className="pl-3">Day</span>
        <span>Session</span>
        <span>Time{offset ? ` · ${offset}` : ""}</span>
        <span className="pr-3 text-right">Weather</span>
      </li>
      {sessions.map((session, index) => (
        <SessionRow
          key={session.id}
          index={index}
          session={session}
          forecast={forecasts[session.id]}
          result={results[session.id]}
          resultsUrl={resultsUrl}
          timesConfirmed={timesConfirmed}
          zone={zone}
          zoneKey={zone?.tz ?? circuitTimeZone}
          track={trackTimes[session.id]}
          phase={now === null ? (session.status === "cancelled" ? "cancelled" : null) : sessionPhase(session, now)}
          isNext={session.id === nextId}
        />
      ))}
    </ol>
  );
}

function SessionRow({
  index,
  session,
  forecast,
  result,
  resultsUrl,
  timesConfirmed,
  zone,
  zoneKey,
  track,
  phase,
  isNext,
}: {
  index: number;
  session: Session;
  forecast: ForecastResult | undefined;
  result: SessionResult | undefined;
  resultsUrl: string;
  timesConfirmed: boolean;
  zone: DisplayZone | null;
  /** The zone the row's text is in, so text re-animates only when the zone actually changes. */
  zoneKey: string;
  track: TrackTimeText | undefined;
  phase: SessionPhase | null;
  isNext: boolean;
}) {
  const cancelled = session.status === "cancelled";
  const live = phase === "live";
  const finished = phase === "finished";
  // Viewer Time once the zone is known; until then the server's Track Time text, so the server HTML
  // carries real times and hydration renders exactly the same strings.
  const day = !timesConfirmed ? null : zone ? formatSessionDay(session.startsAt, zone.tz) : (track ?? null);
  const range = !timesConfirmed
    ? null
    : zone
      ? formatTimeRange(session.startsAt, session.endsAt, zone.tz, undefined, { endEstimated: session.endIsEstimated })
      : (track?.range ?? null);
  const offset = !timesConfirmed ? null : zone ? zoneOffsetLabel(zone.tz, new Date(session.startsAt)) : (track?.offset ?? null);

  return (
    <li
      className={cn(
        "enter-rise relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 py-3.5 pl-2.5 transition-colors duration-500 sm:items-center sm:gap-y-0 sm:py-4 sm:pl-0",
        ROW,
        finished && "text-muted-foreground",
      )}
      style={staggerDelay(index + 1)}
    >
      {live && <span aria-hidden className="live-breathe absolute inset-y-0 left-0 w-0.5 bg-series-gradient-y" />}

      <DayCell day={day} zoneKey={zoneKey} timesConfirmed={timesConfirmed} muted={cancelled || finished} />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className={cn("font-medium tracking-tight", (cancelled || finished) && "text-muted-foreground")}>
            {session.name}
          </h3>
          {cancelled && <span className="chip border border-destructive/50 text-destructive">Cancelled</span>}
          {live && !cancelled && (
            <span className="chip bg-series-accent text-series-accent-foreground">
              <LiveDot className="size-1.5" />
              Live
            </span>
          )}
          {isNext && !live && <span className="chip chip-shimmer border border-series-accent/70 text-series-accent">Next</span>}
          {finished && !cancelled && (
            <>
              <span className="chip px-0 text-muted-foreground">Finished</span>
              <SessionResultsDialog session={session} result={result} resultsUrl={resultsUrl} />
              {session.series === "f1" && (
                // The Telemetry page shows its own spoiler warning, so the chip can link straight to it.
                <Link
                  href={`/f1/telemetry/${sessionSlug(session)}`}
                  className="chip results-chip border border-telemetry/50 bg-telemetry/10 text-telemetry outline-none transition-colors [--chip-delay:120ms] [--chip-sheen:var(--telemetry)] hover:border-telemetry hover:bg-telemetry/20 focus-visible:ring-2 focus-visible:ring-telemetry/60"
                >
                  <ActivityIcon className="size-3" aria-hidden />
                  Telemetry
                  <span className="sr-only"> for {session.name}</span>
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile: time and weather share the second line. From sm up each is its own column. */}
      <div className="col-start-2 flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 sm:contents">
        <p className="font-mono text-xs tabular sm:text-[0.8125rem]">
          {!timesConfirmed ? (
            <span className="chip border border-border text-muted-foreground">
              <span className="sr-only">Time </span>TBC
            </span>
          ) : range ? (
            <time
              key={zoneKey}
              dateTime={session.startsAt}
              className={cn("enter-focus", cancelled ? "text-muted-foreground line-through" : finished ? "" : "text-foreground")}
            >
              {cancelled && <span className="sr-only">Was </span>}
              {range}
              {offset && <span className="sr-only"> {offset}</span>}
            </time>
          ) : (
            <InlineSkeleton className="h-4 w-28" />
          )}
        </p>
        <div className="min-w-0 sm:justify-self-end sm:pr-3">
          {timesConfirmed && !cancelled && <ForecastSlot index={index} forecast={forecast} timeZone={zone?.tz ?? null} />}
        </div>
      </div>
    </li>
  );
}

function DayCell({
  day,
  zoneKey,
  timesConfirmed,
  muted,
}: {
  day: Pick<ReturnType<typeof formatSessionDay>, "weekday" | "day" | "long"> | null;
  zoneKey: string;
  timesConfirmed: boolean;
  muted: boolean;
}) {
  return (
    <div
      className={cn("pt-0.5 font-mono text-xs leading-tight uppercase tabular sm:pt-0 sm:pl-3 sm:text-[0.8125rem]", muted ? "text-muted-foreground" : "text-foreground")}
      aria-hidden={!day}
    >
      {!timesConfirmed ? (
        <span className="text-muted-foreground">—</span>
      ) : day ? (
        <>
          <span key={zoneKey} aria-hidden className="enter-focus flex flex-col sm:flex-row sm:gap-[1ch]">
            <span className="text-muted-foreground">{day.weekday}</span>
            <span>{day.day.padStart(2, "0")}</span>
          </span>
          <span className="sr-only">{day.long}</span>
        </>
      ) : (
        <InlineSkeleton className="h-8 w-8 sm:h-4 sm:w-12" />
      )}
    </div>
  );
}

function ForecastSlot({ index, forecast, timeZone }: { index: number; forecast: ForecastResult | undefined; timeZone: string | null }) {
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
    // Keyed by units, so switching °C/°F or km/h/mph re-focuses the values instead of snapping.
    <div
      key={`${units.value.temp}-${units.value.wind}`}
      className="enter-focus max-sm:[&>span]:text-[0.8125rem] sm:font-mono"
      style={staggerDelay(index, 40, 30)}
    >
      <SessionForecastView
        forecast={forecast ?? { kind: "unavailable" }}
        tempUnit={units.value.temp}
        windUnit={units.value.wind}
        timeZone={timeZone}
      />
    </div>
  );
}
