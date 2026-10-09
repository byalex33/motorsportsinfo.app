"use client";

import { FlagIcon } from "lucide-react";
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
      <span className="relative inline-flex size-2.5 rounded-full bg-current" />
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
        <div className="h-5 w-48 animate-pulse rounded-md bg-foreground/10" />
        <div className="grid max-w-md grid-cols-4 gap-2">
          {UNITS.map((u) => (
            <div key={u.key} className="h-[4.5rem] animate-pulse rounded-xl bg-foreground/[0.07] sm:h-20" />
          ))}
        </div>
      </div>
    );
  }

  const status = getRoundStatus(sessions, now);

  if (status.kind === "finished") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background/60 px-4 py-3 text-sm">
        <FlagIcon className="size-5 text-series-accent" aria-hidden />
        <p>
          <span className="font-semibold">Round complete.</span>{" "}
          <span className="text-muted-foreground">The next Round appears here shortly.</span>
        </p>
      </div>
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
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {isLive ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-series-accent px-2.5 py-1 text-xs font-bold tracking-wide text-series-accent-foreground uppercase">
            <LiveDot className="size-2" />
            Live
          </span>
        ) : (
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Next up</span>
        )}
        <span className="font-semibold">{session.name}</span>
        {!isLive && day && at && (
          <span className="text-muted-foreground">
            · {day.weekday} {at}
          </span>
        )}
        {isLive && <span className="text-muted-foreground">· ends in</span>}
      </p>
      <div
        role="timer"
        aria-live="off"
        aria-label={`${isLive ? `${session.name} ends in` : `${session.name} starts in`} ${formatCountdown(parts)}`}
        className="grid max-w-md grid-cols-4 gap-2"
      >
        {UNITS.map((u) => (
          <div
            key={u.key}
            className={cn(
              "flex h-[4.5rem] flex-col items-center justify-center rounded-xl border bg-background/70 shadow-xs sm:h-20",
              isLive ? "border-series-accent/40" : "border-border",
            )}
          >
            <span className="font-mono text-2xl leading-none font-semibold tabular sm:text-3xl">
              {String(parts[u.key]).padStart(2, "0")}
            </span>
            <span className="mt-1.5 text-[0.65rem] font-semibold tracking-widest text-muted-foreground uppercase">{u.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
