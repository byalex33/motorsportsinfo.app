import { SERIES_IDS, type SeriesId } from "@/domain/types";

/** True for any id in SERIES_IDS. Safe to use on the server. */
export function isSeriesId(value: unknown): value is SeriesId {
  return typeof value === "string" && (SERIES_IDS as readonly string[]).includes(value);
}
