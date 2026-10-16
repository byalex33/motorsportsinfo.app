"use client";

import Link from "next/link";
import { MapPinIcon } from "lucide-react";
import type { CalendarRound } from "@/app/calendar/data";
import { useDisplayZone } from "@/components/round/use-display-zone";
import { SERIES } from "@/domain/series";
import { formatClock, formatSessionDay, zoneOffsetLabel } from "@/lib/time-format";
import { cn } from "@/lib/utils";
import { CountryFlag } from "./country-flag";

const meta = "font-mono text-[0.6875rem] tracking-[0.06em] text-muted-foreground uppercase";

/**
 * One Round on the calendar: flag, Round name, Circuit and every Session's start. The server HTML and the
 * hydration render show Track Time (from props, so the two match); after hydration the times switch to the
 * viewer's chosen zone.
 */
export function CalendarRoundCard({ round, now }: { round: CalendarRound; now: number | null }) {
  const zone = useDisplayZone(round.circuitTimeZone);
  const info = SERIES[round.series];
  const first = round.sessions[0];
  const last = round.sessions.at(-1);
  const live = now !== null && first && last && !round.cancelled && Date.parse(first.startsAt) <= now && now < Date.parse(last.endsAt);
  const offset = first ? (zone ? zoneOffsetLabel(zone.tz, new Date(first.startsAt)) : round.trackTimes[first.id]?.offset) : null;

  return (
    <article
      data-series={round.series}
      aria-labelledby={`${round.id}-name`}
      className="group/card relative flex flex-col overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10 transition-shadow duration-200 hover:ring-foreground/20"
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-series-gradient" />
      <header className="flex items-start gap-3 p-4 pb-3">
        <CountryFlag code={round.countryCode} country={round.country} className="mt-0.5 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className={cn(meta, "flex flex-wrap items-center gap-x-2 gap-y-1")}>
            <span className="font-semibold text-series-accent">{info.shortName}</span>
            <span aria-hidden>·</span>
            <span>
              {round.season}
              {round.roundNumber !== null && ` R${round.roundNumber}`}
            </span>
            {live && <span className="chip bg-series-accent text-series-accent-foreground">Live</span>}
            {round.cancelled && <span className="chip bg-destructive/10 text-destructive">Cancelled</span>}
          </p>
          <h3 id={`${round.id}-name`} className="mt-1 text-base leading-snug font-semibold tracking-tight text-balance">
            {/* The name is the anchor; the ::after covers the card. prefetch stays off: a calendar
                full of Round pages would otherwise render each one as it scrolls into view. */}
            <Link
              href={round.path}
              prefetch={false}
              className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {round.name}
            </Link>
          </h3>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPinIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0">
              <span className="text-foreground/90">{round.circuitName}</span>
              <span className="block text-xs">{round.location}</span>
            </span>
          </p>
        </div>
        {round.sprint && <span className="chip shrink-0 bg-series-accent/15 text-series-accent ring-1 ring-series-accent/30">Sprint</span>}
      </header>

      <div className="border-t border-border px-4 py-3">
        <div className={cn(meta, "mb-2 flex items-center justify-between gap-2")}>
          <span className="tabular">{round.dates}</span>
          {offset && (
            <span key={zone?.tz ?? "track"} className={cn("tabular", zone && "enter-focus")} title={zone ? zone.label : `Track time · ${round.circuitTimeZone}`}>
              {offset}
            </span>
          )}
        </div>
        {!round.timesConfirmed || round.sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Session times TBC</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {round.sessions.map((s) => {
              const track = round.trackTimes[s.id];
              const parts = zone ? formatSessionDay(s.startsAt, zone.tz) : null;
              const day = parts ? `${parts.weekday} ${parts.day}` : track?.day;
              const clock = zone ? formatClock(s.startsAt, zone.tz) : track?.clock;
              const cancelled = s.status === "cancelled";
              const finished = now !== null && Date.parse(s.endsAt) <= now;
              const isRace = s.type === "race" || s.type === "feature-race";
              return (
                <li
                  key={s.id}
                  className={cn(
                    "grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-baseline gap-x-3",
                    (cancelled || finished) && "text-muted-foreground",
                  )}
                >
                  <span className="font-mono text-xs text-muted-foreground tabular">{day}</span>
                  <span className={cn("truncate", isRace && !cancelled && "font-semibold", cancelled && "line-through")}>{s.name}</span>
                  <time
                    key={zone?.tz ?? "track"}
                    dateTime={s.startsAt}
                    className={cn("font-mono text-xs tabular", zone && "enter-focus", cancelled && "line-through")}
                  >
                    {clock}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
      </div>

    </article>
  );
}
