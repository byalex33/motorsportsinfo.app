"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { SERIES, SESSION_TYPE_LABELS } from "@/domain/series";
import { SERIES_IDS, type SeriesId, type SessionType } from "@/domain/types";
import { isFollowing, type Follows } from "@/server/alerts/selection";

export interface SelectionGridProps {
  follows: Follows;
  onToggle: (series: SeriesId, type: SessionType, on: boolean) => void;
}

/**
 * Every Series × its Session Types. Shared by Session Reminders and the calendar feed.
 * Two columns on phones, three on tablets, four on desktop. Every cell draws its own right and
 * bottom hairline; the wrapper clips the outer ones, so the rules stay single at any column count
 * and a part-filled last row just ends.
 */
export function SelectionGrid({ follows, onToggle }: SelectionGridProps) {
  return (
    <div className="overflow-hidden border-y border-border">
      <div className="-mr-px -mb-px grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {SERIES_IDS.map((seriesId) => {
          const series = SERIES[seriesId];
          return (
            <fieldset key={seriesId} data-series={seriesId} className="min-w-0 border-r border-b border-border px-3 py-4 sm:px-4">
              <legend className="eyebrow float-left flex w-full items-center gap-2 pb-3 text-foreground">
                <span aria-hidden className="size-1.5 rounded-full bg-series-gradient" />
                {series.shortName}
                {series.name !== series.shortName && <span className="sr-only"> ({series.name})</span>}
              </legend>
              <ul className="clear-both grid gap-0.5">
                {series.sessionTypes.map((type) => {
                  const label = SESSION_TYPE_LABELS[type];
                  return (
                    <li key={type}>
                      <label className="-mx-1.5 flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1 text-sm leading-tight transition-colors hover:bg-subtle">
                        <Checkbox
                          checked={isFollowing(follows, seriesId, type)}
                          onCheckedChange={(checked) => onToggle(seriesId, type, checked)}
                          aria-label={`${series.shortName} ${label}`}
                          className="border-muted-foreground/60"
                        />
                        <span>{label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
