"use client";

import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { staggerDelay } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { SERIES, SESSION_TYPE_LABELS } from "@/domain/series";
import { SERIES_IDS, type SeriesId } from "@/domain/types";
import { track } from "@/lib/analytics";
import { useSeriesPref } from "@/lib/prefs";
import type { SeriesSummary } from "@/lib/series-summary";
import { SeriesSummaryLines } from "./series-summary-lines";

/**
 * Every Series as a row. The viewer's last pick gets a chip — never an automatic redirect. When
 * `current` is given (the header's picker on a Series page) that row is marked instead. With
 * `summaries` (the home page) each full-size row also shows its Featured Round and next Session.
 */
export function SeriesPicker({
  compact = false,
  current = null,
  summaries,
  onNavigate,
}: {
  compact?: boolean;
  current?: SeriesId | null;
  summaries?: Partial<Record<SeriesId, SeriesSummary>>;
  /** Called when a row is chosen, e.g. to close the dialog around the picker. */
  onNavigate?: () => void;
}) {
  const { value: remembered, set } = useSeriesPref();

  function choose(series: SeriesId) {
    set(series);
    track("series_selected", { series });
    onNavigate?.();
  }

  return (
    <ul className={cn("divide-y divide-border", !compact && "border-y border-border")}>
      {SERIES_IDS.map((id, i) => {
        const info = SERIES[id];
        const isCurrent = current === id;
        const chip = current ? (isCurrent ? "Viewing" : null) : remembered === id ? "Last viewed" : null;
        const summary = summaries?.[id];
        return (
          // Seven rows: a tighter step, capped so the last row has started by ~300 ms.
          <li key={id} data-series={id} className="enter-rise min-w-0" style={staggerDelay(i, 90, 35, 6)}>
            <Link
              href={`/${id}`}
              prefetch
              onClick={() => choose(id)}
              aria-current={isCurrent ? "page" : undefined}
              aria-describedby={chip ? `picker-chip-${id}` : undefined}
              className={cn(
                "group relative isolate grid grid-cols-[1.5rem_5.5rem_minmax(0,1fr)_auto] items-center gap-x-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                // Hover: a neutral wash wipes in, with a thin Series-gradient line along the bottom.
                "before:absolute before:inset-0 before:-z-10 before:origin-right before:scale-x-0 before:bg-muted/70 before:transition-transform before:duration-500 before:ease-expo hover:before:origin-left hover:before:scale-x-100",
                "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-right after:scale-x-0 after:bg-series-gradient after:transition-transform after:duration-500 after:ease-expo hover:after:origin-left hover:after:scale-x-100",
                compact
                  ? "px-4 py-3.5 sm:grid-cols-[1.75rem_6.5rem_minmax(0,1fr)_auto] sm:py-4"
                  : "px-1 py-5 sm:grid-cols-[2.5rem_9rem_minmax(0,1fr)_auto] sm:gap-x-4 sm:px-3 sm:py-6",
              )}
            >
              <span className="self-start pt-1.5 font-mono text-xs text-muted-foreground tabular sm:self-center sm:pt-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex min-w-0 items-center gap-2 self-start sm:self-center">
                <span className={cn("text-xl leading-none font-semibold tracking-tight sm:text-2xl", !compact && "sm:text-4xl")}>
                  {info.shortName}
                </span>
                <span
                  aria-hidden
                  className="relative size-1.5 shrink-0 rounded-full bg-series-gradient transition-transform duration-500 ease-spring group-hover:scale-[1.6] after:absolute after:inset-0 after:rounded-full after:bg-series-gradient after:opacity-0 after:transition-[opacity,scale] after:duration-500 after:ease-expo group-hover:after:scale-[2.6] group-hover:after:opacity-20"
                />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="font-medium text-foreground">{info.name}</span>
                  {chip && (
                    <span id={`picker-chip-${id}`} className="chip border border-border text-muted-foreground">
                      {chip}
                    </span>
                  )}
                </span>
                {!compact &&
                  (summary ? (
                    <SeriesSummaryLines summary={summary} />
                  ) : (
                    <span className="mt-1 block font-mono text-[0.6875rem] leading-relaxed tracking-[0.06em] text-muted-foreground uppercase">
                      {info.sessionTypes.map((t) => SESSION_TYPE_LABELS[t]).join(" · ")}
                    </span>
                  ))}
              </span>
              <ArrowRightIcon
                className="size-4 text-muted-foreground transition-[color,translate] duration-500 ease-spring group-hover:translate-x-1 group-hover:text-foreground group-focus-visible:translate-x-1 group-focus-visible:text-foreground"
                aria-hidden
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
