import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const MAP_HEIGHT = "h-[280px] md:h-[360px]";

/** Card frame shared by the radar map, its loading placeholder and the no-coverage notice. */
export function RadarCard({
  circuitName,
  children,
  footer,
}: {
  circuitName: string;
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
            Rain radar<span className="text-muted-foreground"> · past 2 hours</span>
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
      <div className="h-11" aria-hidden="true" />
    </RadarCard>
  );
}
