"use client";

import { FlagIcon } from "lucide-react";
import { Fragment, useState } from "react";
import type { TimedSession } from "@/domain/types";
import { useNow } from "@/lib/client-stores";
import { countdownParts, formatCountdown, getRoundStatus } from "@/lib/round-status";
import { formatClock, formatSessionDay } from "@/lib/time-format";
import { sessionStartSentence, type TrackTimeText } from "@/lib/track-time";
import { cn } from "@/lib/utils";
import { useDisplayZone } from "./use-display-zone";

const UNITS = [
  { key: "days", label: "Days" },
  { key: "hours", label: "Hrs" },
  { key: "minutes", label: "Min" },
  { key: "seconds", label: "Sec" },
] as const;

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative flex size-2.5", className)} aria-hidden>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
      <span className="relative inline-flex size-full rounded-full bg-current" />
    </span>
  );
}

/**
 * One odometer digit. Only a digit that changes animates: the old one rolls out downwards while
 * the new one drops in, inside a fixed-width monospace slot, so nothing around it moves.
 */
function RollingDigit({ digit }: { digit: string }) {
  const [roll, setRoll] = useState({ current: digit, previous: null as string | null, turn: 0 });
  if (roll.current !== digit) {
    // Derived state from the previous render (React's "storing information from previous renders").
    setRoll({ current: digit, previous: roll.current, turn: roll.turn + 1 });
  }
  return (
    <span className="digit-slot">
      {roll.previous !== null && (
        <span key={`out-${roll.turn}`} aria-hidden className="digit-out">
          {roll.previous}
        </span>
      )}
      <span key={`in-${roll.turn}`} className={roll.turn > 0 ? "digit-in" : "block"}>
        {roll.current}
      </span>
    </span>
  );
}

function RollingNumber({ value }: { value: string }) {
  const digits = value.split("");
  return (
    <span className="flex">
      {digits.map((d, i) => (
        // Keyed from the right, so units stay units when the day count gains a digit.
        <RollingDigit key={digits.length - i} digit={d} />
      ))}
    </span>
  );
}

/** Live countdown to the next Session, or a "Live" badge while a Session is running. */
export function RoundCountdown({
  sessions,
  circuitTimeZone,
  trackTimes,
  renderedAt,
  finishedNote = "The next Round appears here shortly.",
}: {
  sessions: TimedSession[];
  circuitTimeZone: string;
  /** Server-rendered Track Time text per Session, shown until the viewer's zone is known. */
  trackTimes: Record<string, TrackTimeText>;
  /** When the page data was rendered: the server HTML (and hydration) show the status at that moment. */
  renderedAt: string;
  /** Shown after "Round complete." once every Session has finished. */
  finishedNote?: string;
}) {
  const clock = useNow(1000);
  const zone = useDisplayZone(circuitTimeZone);
  // Server render and hydration: the status when the data was rendered, in Track Time, with the
  // digits held as placeholders of the same size. Both come from props, so the two renders match.
  const hydrating = clock === null;
  const now = clock ?? Date.parse(renderedAt);
  const status = getRoundStatus(sessions, now);

  if (status.kind === "finished") {
    return (
      <p className="enter-focus flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-sm">
        <FlagIcon className="size-4 text-series-accent" aria-hidden />
        <span className="font-medium">Round complete.</span>
        <span className="text-muted-foreground">{finishedNote}</span>
      </p>
    );
  }

  const { session } = status;
  const isLive = status.kind === "live";
  const target = isLive ? session.endsAt : session.startsAt;
  const parts = countdownParts(target, now);
  const track = trackTimes[session.id];
  const when = zone
    ? `${formatSessionDay(session.startsAt, zone.tz).weekday} ${formatClock(session.startsAt, zone.tz)}`
    : track
      ? `${track.weekday} ${track.clock} ${track.offset}`
      : null;

  return (
    <div className="enter-focus flex flex-col items-center space-y-4">
      <p className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-sm">
        {isLive ? (
          <span className="chip bg-series-accent text-series-accent-foreground">
            <LiveDot className="size-1.5" />
            Live
          </span>
        ) : (
          <span className="chip chip-shimmer border border-series-accent/70 text-series-accent">Next</span>
        )}
        <span className="font-medium">
          {session.name} {isLive ? "ends in" : "starts in"}
        </span>
        {!isLive && when && (
          <time dateTime={session.startsAt} className="font-mono text-xs tracking-[0.06em] text-muted-foreground uppercase tabular">
            {when}
          </time>
        )}
        {/* The full start time in words for crawlers and screen readers, until the live countdown takes over. */}
        {hydrating && track && <span className="sr-only">{sessionStartSentence(session.name, track, isLive)}</span>}
      </p>
      <div
        role="timer"
        aria-live="off"
        aria-label={hydrating ? undefined : `${isLive ? `${session.name} ends in` : `${session.name} starts in`} ${formatCountdown(parts)}`}
        aria-hidden={hydrating || undefined}
        className="flex items-start justify-center font-mono tabular"
      >
        {UNITS.map((u, i) => (
          <Fragment key={u.key}>
            {i > 0 && (
              <span aria-hidden className="px-1 text-[2.75rem] leading-none text-muted-foreground/40 sm:px-1.5 sm:text-6xl">
                :
              </span>
            )}
            <span className="flex flex-col">
              <span className="text-[2.75rem] leading-none font-medium tracking-[-0.04em] sm:text-6xl">
                {hydrating ? (
                  // Same glyphs and box as the digits, so nothing moves when the countdown starts.
                  <span className="flex animate-pulse rounded-md bg-muted text-transparent">00</span>
                ) : (
                  <RollingNumber value={String(parts[u.key]).padStart(2, "0")} />
                )}
              </span>
              <span className="eyebrow mt-2 text-muted-foreground">{u.label}</span>
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
