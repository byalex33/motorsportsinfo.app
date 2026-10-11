"use client";

import { GlobeIcon } from "lucide-react";
import { useState } from "react";
import type { CalendarRound } from "@/app/calendar/data";
import { SegmentPill } from "@/components/motion/segment-pill";
import { SegmentButton, segmentTrack } from "@/components/round/display-controls";
import { TimeZonePicker } from "@/components/round/time-zone-picker";
import { FEATURED_ROUND_GRACE_MINUTES, SERIES } from "@/domain/series";
import { SERIES_IDS, type SeriesId } from "@/domain/types";
import { track } from "@/lib/analytics";
import { useNow } from "@/lib/client-stores";
import { useTimePref, type TimeMode } from "@/lib/prefs";
import { deviceTimeZone } from "@/lib/time-format";
import { cn } from "@/lib/utils";
import { CalendarRoundCard } from "./calendar-round-card";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "October 2026" from "2026-10-09". */
function monthHeading(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${y}`;
}

const chip =
  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium ring-1 transition-[color,background-color,box-shadow,scale] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95";

/** The time zone control: your time, Track Time (each Round's own Circuit) or a chosen zone. */
function ZoneControls() {
  const time = useTimePref();
  const mode = time.ready ? time.value.mode : null;

  function setMode(next: TimeMode, tz?: string) {
    if (next === time.value.mode && tz === time.value.tz) return;
    time.set(next === "custom" ? { mode: next, tz } : { mode: next });
    track("timezone_mode_changed", { mode: next });
  }

  const label =
    mode === "track"
      ? { heading: "Track time", detail: "each Circuit's own zone" }
      : mode === "custom" && time.value.tz
        ? { heading: "Times in your chosen zone", detail: time.value.tz }
        : mode === "viewer"
          ? { heading: "Times in your time", detail: deviceTimeZone() }
          : null;

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <p className="flex min-w-0 items-center gap-2 text-sm" aria-live="polite">
        <GlobeIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {/* Until the viewer's zone is known (server HTML, hydration) the cards show Track Time. */}
        <span className="min-w-0 truncate">
          <span className="font-medium">{label ? label.heading : "Track time"}</span>
          <span className="font-mono text-xs text-muted-foreground"> · {label ? label.detail : "each Circuit's own zone"}</span>
        </span>
      </p>
      <div role="group" aria-label="Show times in" className={cn(segmentTrack, "min-w-0 self-start md:self-auto")}>
        <SegmentPill />
        <SegmentButton active={mode === "viewer"} onClick={() => setMode("viewer")}>
          Your time
        </SegmentButton>
        <SegmentButton active={mode === "track"} onClick={() => setMode("track")}>
          Track time
        </SegmentButton>
        <TimeZonePicker
          active={mode === "custom"}
          value={time.value.mode === "custom" ? (time.value.tz ?? null) : null}
          onSelect={(tz) => setMode("custom", tz)}
          className="max-w-36"
        />
      </div>
    </div>
  );
}

/** Every unfinished Round as a card, grouped by month, with a Series filter. */
export function CalendarList({ rounds, renderedAt }: { rounds: CalendarRound[]; renderedAt: string }) {
  const [shown, setShown] = useState<SeriesId | "all">("all");
  const clock = useNow(60_000);
  // A Round can finish while the page is open: drop it once it stops being featured, as the server does.
  const now = clock ?? Date.parse(renderedAt);
  const visible = rounds.filter((r) => {
    if (shown !== "all" && r.series !== shown) return false;
    const last = r.sessions.at(-1);
    return clock === null || !last || Date.parse(last.endsAt) + FEATURED_ROUND_GRACE_MINUTES * 60_000 > now;
  });
  const present = new Set(rounds.map((r) => r.series));

  const months: { key: string; heading: string; rounds: CalendarRound[] }[] = [];
  for (const r of visible) {
    const key = r.startDate.slice(0, 7);
    const group = months.at(-1);
    if (group?.key === key) group.rounds.push(r);
    else months.push({ key, heading: monthHeading(r.startDate), rounds: [r] });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <ZoneControls />
        <div role="group" aria-label="Show Series" className="flex flex-wrap gap-2">
          {(["all", ...SERIES_IDS] as const).map((id) => {
            const active = shown === id;
            const disabled = id !== "all" && !present.has(id);
            return (
              <button
                key={id}
                type="button"
                data-series={id === "all" ? undefined : id}
                aria-pressed={active}
                disabled={disabled}
                onClick={() => setShown(id)}
                className={cn(
                  chip,
                  active
                    ? "bg-foreground text-background ring-foreground"
                    : "text-muted-foreground ring-border hover:text-foreground hover:ring-foreground/30",
                  disabled && "pointer-events-none opacity-40",
                )}
              >
                {id !== "all" && <span aria-hidden className="size-1.5 rounded-full bg-series-gradient" />}
                {id === "all" ? "All Series" : SERIES[id].shortName}
              </button>
            );
          })}
        </div>
      </div>

      {months.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No upcoming Rounds{shown === "all" ? "" : ` for ${SERIES[shown].name}`} yet. They appear here once their dates are published.
        </p>
      ) : (
        months.map((month) => (
          <section key={month.key} aria-labelledby={`month-${month.key}`} className="space-y-4">
            <h2 id={`month-${month.key}`} className="eyebrow flex items-baseline justify-between gap-4 border-b border-border pb-2 text-muted-foreground">
              <span>{month.heading}</span>
              <span className="tabular">
                {month.rounds.length} Round{month.rounds.length === 1 ? "" : "s"}
              </span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {month.rounds.map((round) => (
                <CalendarRoundCard key={round.id} round={round} now={clock} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
