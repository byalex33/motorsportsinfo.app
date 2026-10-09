"use client";

import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { SERIES, SESSION_TYPE_LABELS } from "@/domain/series";
import { SERIES_IDS, type SeriesId } from "@/domain/types";
import { track } from "@/lib/analytics";
import { useSeriesPref } from "@/lib/prefs";
import { cn } from "@/lib/utils";

/** Four Series cards. The viewer's last pick is highlighted — never an automatic redirect. */
export function SeriesPicker() {
  const { value: remembered, set } = useSeriesPref();

  function choose(series: SeriesId) {
    set(series);
    track("series_selected", { series });
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
      {SERIES_IDS.map((id, i) => {
        const info = SERIES[id];
        const isLast = remembered === id;
        return (
          <li key={id} className="min-w-0">
            <Link
              href={`/${id}`}
              prefetch
              onClick={() => choose(id)}
              aria-describedby={isLast ? `last-${id}` : undefined}
              className={cn(
                "group relative flex h-full min-h-36 flex-col justify-between overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-all outline-none sm:min-h-44 sm:p-6",
                "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring/50",
                isLast ? "border-primary/60 ring-2 ring-primary/30" : "border-border",
              )}
            >
              <span
                aria-hidden
                className="bg-chequer pointer-events-none absolute -top-6 -right-6 size-28 rotate-12 rounded-xl text-primary opacity-[0.06] transition-opacity group-hover:opacity-[0.12]"
              />
              <span className="flex items-start justify-between gap-3">
                <span className="font-mono text-xs font-medium text-muted-foreground tabular">0{i + 1}</span>
                {isLast && (
                  <span
                    id={`last-${id}`}
                    className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground"
                  >
                    Your last pick
                  </span>
                )}
              </span>
              <span className="mt-6 block">
                <span className="block text-4xl font-extrabold tracking-tighter text-foreground sm:text-5xl">
                  {info.shortName}
                </span>
                <span className="mt-1 flex items-end justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground/90">{info.name}</span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                      {info.sessionTypes.map((t) => SESSION_TYPE_LABELS[t]).join(" · ")}
                    </span>
                  </span>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <ArrowRightIcon className="size-4" aria-hidden />
                  </span>
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
