import type { SeriesId } from "@/domain/types";

/** Cache tag for a Series' published schedule. The sync revalidates it after every published write. */
export function scheduleTag(series: SeriesId): string {
  return `schedule:${series}`;
}
