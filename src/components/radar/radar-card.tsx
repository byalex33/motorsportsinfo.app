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
      className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs"
    >
      <header className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-2">
        <h2 id="rain-radar-heading" className="text-sm font-semibold">
          Rain radar
        </h2>
        <p className="min-w-0 truncate text-xs text-muted-foreground">{circuitName}</p>
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
