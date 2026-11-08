import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const MAP_HEIGHT = "h-[280px] md:h-[360px]";

/** Card frame shared by the radar map, its loading placeholder and the no-coverage notice. */
const TIME_SPAN_LABELS = { forecast: "next 2 hours", past: "past 2 hours" } as const;

/** The radar credit lines ADR 0001 requires on the page, by the feed the map plays. */
const RADAR_CREDITS = {
  forecast: { label: "Forecast radar: Rainbow.ai", href: "https://www.rainbow.ai/" },
  past: { label: "Radar: RainViewer", href: "https://www.rainviewer.com/" },
} as const;

/**
 * The always-visible credit under the map (MapLibre's compact attribution collapses on the first drag).
 * The line keeps its height while the feed loads, so the card does not grow when the credit appears.
 */
export function RadarCredit({ kind }: { kind?: keyof typeof RADAR_CREDITS }) {
  const credit = kind ? RADAR_CREDITS[kind] : null;
  return (
    <p className="h-7 truncate border-t border-border px-3 font-mono text-[0.6875rem] leading-7 tracking-[0.04em] text-muted-foreground">
      {credit && (
        <a className="transition-colors hover:text-foreground" href={credit.href} target="_blank" rel="noopener noreferrer">
          {credit.label}
        </a>
      )}
    </p>
  );
}

export function RadarCard({
  circuitName,
  timeSpan,
  children,
  footer,
}: {
  circuitName: string;
  /** What the map is playing; unknown while the frames load. */
  timeSpan?: keyof typeof TIME_SPAN_LABELS;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section
      aria-labelledby="rain-radar-heading"
      className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground"
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
        <h2 id="rain-radar-heading" className="eyebrow flex shrink-0 items-center gap-2 whitespace-nowrap text-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-series-gradient" />
          <span>
            Rain radar{timeSpan && <span className="text-muted-foreground"> · {TIME_SPAN_LABELS[timeSpan]}</span>}
          </span>
        </h2>
        <p className="eyebrow min-w-0 truncate text-muted-foreground">{circuitName}</p>
      </header>
      {children}
      {footer}
    </section>
  );
}

export function RadarMapPlaceholder({ circuitName }: { circuitName: string }) {
  return (
    <RadarCard circuitName={circuitName}>
      <div className={cn(MAP_HEIGHT, "animate-pulse bg-muted")} aria-hidden="true" />
      <div className="h-11 border-t border-border" aria-hidden="true" />
      <RadarCredit />
    </RadarCard>
  );
}
