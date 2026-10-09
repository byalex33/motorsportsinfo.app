"use client";

import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { SERIES, SESSION_TYPE_LABELS } from "@/domain/series";
import { SERIES_IDS, type SeriesId } from "@/domain/types";
import { track } from "@/lib/analytics";
import { useSeriesPref } from "@/lib/prefs";

/** The four Series as rows. The viewer's last pick gets a chip — never an automatic redirect. */
export function SeriesPicker() {
  const { value: remembered, set } = useSeriesPref();

  function choose(series: SeriesId) {
    set(series);
    track("series_selected", { series });
  }

  return (
    <ul className="divide-y divide-border border-y border-border">
      {SERIES_IDS.map((id, i) => {
        const info = SERIES[id];
        const isLast = remembered === id;
        return (
          <li key={id} data-series={id} className="min-w-0">
            <Link
              href={`/${id}`}
              prefetch
              onClick={() => choose(id)}
              aria-describedby={isLast ? `last-${id}` : undefined}
              className="group grid grid-cols-[1.5rem_4.25rem_minmax(0,1fr)_auto] items-center gap-x-3 px-1 py-5 transition-colors outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[2.5rem_7rem_minmax(0,1fr)_auto] sm:gap-x-4 sm:px-3 sm:py-6"
            >
              <span className="self-start pt-1.5 font-mono text-xs text-muted-foreground tabular sm:self-center sm:pt-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex items-center gap-2 self-start sm:self-center">
                <span className="text-2xl leading-none font-semibold tracking-tight sm:text-4xl">{info.shortName}</span>
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-series-accent" />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="font-medium text-foreground">{info.name}</span>
                  {isLast && (
                    <span id={`last-${id}`} className="chip border border-border text-muted-foreground">
                      Last viewed
                    </span>
                  )}
                </span>
                <span className="mt-1 block font-mono text-[0.6875rem] leading-relaxed tracking-[0.06em] text-muted-foreground uppercase">
                  {info.sessionTypes.map((t) => SESSION_TYPE_LABELS[t]).join(" · ")}
                </span>
              </span>
              <ArrowRightIcon
                className="size-4 text-muted-foreground transition-[color,translate] group-hover:translate-x-0.5 group-hover:text-foreground"
                aria-hidden
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
