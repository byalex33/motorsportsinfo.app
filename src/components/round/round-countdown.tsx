"use client";

import { FlagIcon } from "lucide-react";
import { Fragment } from "react";
import type { Session } from "@/domain/types";
import { useNow } from "@/lib/client-stores";
import { countdownParts, formatCountdown, getRoundStatus } from "@/lib/round-status";
import { formatClock, formatSessionDay } from "@/lib/time-format";
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

/** Live countdown to the next Session, or a "Live" badge while a Session is running. */
export function RoundCountdown({ sessions, circuitTimeZone }: { sessions: Session[]; circuitTimeZone: string }) {
  const now = useNow(1000);
  const zone = useDisplayZone(circuitTimeZone);

  if (now === null) {
    // Server render and hydration: a stable placeholder with the same footprint.
    return (
      <div className="space-y-3" aria-hidden>
        <div className="h-5 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-[4.75rem] w-72 animate-pulse rounded-md bg-muted sm:h-[5.5rem] sm:w-[22rem]" />
      </div>
    );
  }

  const status = getRoundStatus(sessions, now);

  if (status.kind === "finished") {
    return (
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border pt-4 text-sm lg:border-t-0 lg:pt-0">
        <FlagIcon className="size-4 text-series-accent" aria-hidden />
        <span className="font-medium">Round complete.</span>
        <span className="text-muted-foreground">The next Round appears here shortly.</span>
      </p>
    );
  }

  const { session } = status;
  const isLive = status.kind === "live";
  const target = isLive ? session.endsAt : session.startsAt;
  const parts = countdownParts(target, now);
  const day = zone ? formatSessionDay(session.startsAt, zone.tz) : null;
  const at = zone ? formatClock(session.startsAt, zone.tz) : null;

  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
        {isLive ? (
          <span className="chip bg-series-accent text-series-accent-foreground">
            <LiveDot className="size-1.5" />
            Live
          </span>
        ) : (
          <span className="chip border border-series-accent/70 text-series-accent">Next</span>
        )}
        <span className="font-medium">
          {session.name} {isLive ? "ends in" : "starts in"}
        </span>
        {!isLive && day && at && (
          <span className="font-mono text-xs tracking-[0.06em] text-muted-foreground uppercase tabular">
            {day.weekday} {at}
          </span>
        )}
      </p>
      <div
        role="timer"
        aria-live="off"
        aria-label={`${isLive ? `${session.name} ends in` : `${session.name} starts in`} ${formatCountdown(parts)}`}
        className="flex items-start font-mono tabular"
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
                {String(parts[u.key]).padStart(2, "0")}
              </span>
              <span className="eyebrow mt-2 text-muted-foreground">{u.label}</span>
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
