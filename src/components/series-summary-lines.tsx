"use client";

import { useDisplayZone } from "@/components/round/use-display-zone";
import { useNow } from "@/lib/client-stores";
import { formatStartsIn, nextSession, type SeriesSummary } from "@/lib/series-summary";
import { formatClock, formatSessionDay } from "@/lib/time-format";

const status = "mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.6875rem] leading-relaxed tracking-[0.06em] text-muted-foreground uppercase";

/**
 * A home page row's Featured Round and the Session to watch next. The server HTML and the hydration
 * render show the next Session as of when the data was rendered, in Track Time (from props, so the two
 * match); after hydration it switches to Viewer Time and a live "in 2d 4h".
 */
export function SeriesSummaryLines({ summary }: { summary: SeriesSummary }) {
  if (summary.kind === "unavailable") {
    return <span className={status}>Schedule coming soon</span>;
  }
  if (summary.kind === "season-complete") {
    return (
      <>
        <span className="mt-1 block text-sm text-muted-foreground">{summary.season} season complete</span>
        <span className={status}>Next Round once its dates are published</span>
      </>
    );
  }
  return (
    <>
      {/* Phones: the dates on their own line rather than broken mid-range. */}
      <span className="mt-1 block text-sm text-pretty text-muted-foreground">
        <span className="text-foreground/90">{summary.roundName}</span>
        <span aria-hidden className="max-sm:hidden">
          {" "}
          ·{" "}
        </span>
        <span className="sr-only">, </span>
        <span className="block whitespace-nowrap tabular sm:inline">{summary.dates}</span>
      </span>
      <NextSessionLine summary={summary} />
    </>
  );
}

function NextSessionLine({ summary }: { summary: Extract<SeriesSummary, { kind: "round" }> }) {
  const clock = useNow(15_000);
  const zone = useDisplayZone(summary.circuitTimeZone);

  if (!summary.timesConfirmed) return <span className={status}>Session times TBC</span>;

  const now = clock ?? Date.parse(summary.renderedAt);
  const next = nextSession(summary.sessions, now);
  if (next.kind === "finished") return <span className={status}>Round complete</span>;

  const { session } = next;
  if (next.kind === "live") {
    return (
      <span className={status}>
        <span className="chip bg-series-accent text-series-accent-foreground">Live</span>
        <span className="text-foreground">{session.name}</span>
      </span>
    );
  }

  const track = summary.trackTimes[session.id];
  const when = zone
    ? `${formatSessionDay(session.startsAt, zone.tz).weekday} ${formatClock(session.startsAt, zone.tz)}`
    : track
      ? `${track.weekday} ${track.clock} ${track.offset}`
      : null;
  // Two groups ("Next Race" and an unbreakable "Sun 13:00 · in 9h 33m"), so a narrow row wraps between them.
  return (
    <span className={status}>
      <span className="flex items-center gap-x-2">
        <span className="font-semibold text-series-accent">Next</span>
        <span className="text-foreground">{session.name}</span>
      </span>
      {(when || clock !== null) && (
        <>
          <span aria-hidden className="max-sm:hidden">
            ·
          </span>
          <span className="flex items-center gap-x-2 whitespace-nowrap tabular">
            {when && (
              // Keyed by zone so the switch from Track Time to Viewer Time brightens in.
              <time key={zone?.tz ?? "track"} dateTime={session.startsAt} className={zone ? "enter-focus" : undefined}>
                {when}
              </time>
            )}
            {when && clock !== null && <span aria-hidden>·</span>}
            {clock !== null && <span>{formatStartsIn(Date.parse(session.startsAt) - now)}</span>}
          </span>
        </>
      )}
    </span>
  );
}
