"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { SERIES, SESSION_TYPE_LABELS } from "@/domain/series";
import { SERIES_IDS, type SeriesId, type SessionType } from "@/domain/types";
import { isFollowing, type Follows } from "@/server/alerts/selection";

export interface SelectionGridProps {
  follows: Follows;
  onToggle: (series: SeriesId, type: SessionType, on: boolean) => void;
}

/** Every Series × its Session Types. Shared by Session Reminders and the calendar feed. */
export function SelectionGrid({ follows, onToggle }: SelectionGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {SERIES_IDS.map((seriesId) => {
        const series = SERIES[seriesId];
        return (
          <fieldset key={seriesId} className="min-w-0 rounded-lg border border-border px-2 py-2 sm:p-3">
            <legend className="px-1 text-sm font-semibold">
              {series.shortName}
              <span className="sr-only"> ({series.name})</span>
            </legend>
            <ul className="mt-1 grid gap-1">
              {series.sessionTypes.map((type) => {
                const label = SESSION_TYPE_LABELS[type];
                return (
                  <li key={type}>
                    <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm leading-tight hover:bg-muted/60">
                      <Checkbox
                        checked={isFollowing(follows, seriesId, type)}
                        onCheckedChange={(checked) => onToggle(seriesId, type, checked)}
                        aria-label={`${series.shortName} ${label}`}
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
  );
}
