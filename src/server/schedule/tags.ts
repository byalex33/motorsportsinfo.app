import type { SeriesId } from "@/domain/types";

/** Cache tag for a Series' published schedule. The sync revalidates it after every published write. */
export function scheduleTag(series: SeriesId): string {
  return `schedule:${series}`;
}

/** Cache tag for what a Series' due-check reads from source_checks and pending changes. syncSeries expires it around every check. */
export function checkStateTag(series: SeriesId): string {
  return `sync-check:${series}`;
}
