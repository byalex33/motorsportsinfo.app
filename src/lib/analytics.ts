// CONTRACT — owned by the analytics work. Call track() after an action completes.
import type { SeriesId, SessionType } from "@/domain/types";

export type AnalyticsEvent =
  | { name: "series_selected"; props: { series: SeriesId } }
  | { name: "timezone_mode_changed"; props: { mode: "viewer" | "track" | "custom" } }
  | { name: "units_changed"; props: { temp: "c" | "f"; wind: "kmh" | "mph" } }
  | { name: "push_enabled"; props: { series_count: number } }
  | { name: "push_disabled"; props: { series_count: number } }
  | { name: "calendar_feed_created"; props: { series: SeriesId[]; session_types: SessionType[] } }
  | { name: "radar_opened"; props: { series: SeriesId } };

export function track<E extends AnalyticsEvent>(name: E["name"], props: E["props"]): void {
  void name;
  void props;
}
