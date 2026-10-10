// Which frames the radar map plays: the Rainbow.ai forecast (now → +2 h) through our tile relay, or,
// when that is unavailable, RainViewer's past 2 hours.
import { FORECAST_MAX_ZOOM, FORECAST_SNAPSHOT_PATH, forecastOffsets, forecastTileTemplate } from "@/lib/radar-forecast";
import { RAINVIEWER_ATTRIBUTION, RAINVIEWER_MAX_ZOOM, fetchRadarFrames, type RadarFrame } from "./rainviewer";

export const RAINBOW_ATTRIBUTION = '<a href="https://www.rainbow.ai/" target="_blank" rel="noopener">Rainbow.ai</a>';

export interface RadarFeed {
  kind: "forecast" | "past";
  /** Oldest first. */
  frames: RadarFrame[];
  attribution: string;
  /** Tiles are fetched up to this zoom and overzoomed beyond it. */
  maxZoom: number;
}

/** Forecast frames for one snapshot: the snapshot itself, then every 10 minutes to 2 hours ahead. */
export function buildForecastFrames(snapshot: number, origin: string): RadarFrame[] {
  return forecastOffsets().map((offset) => ({
    time: snapshot + offset,
    id: `rainbow-${snapshot}-${offset}`,
    tileUrl: forecastTileTemplate(origin, snapshot, offset),
  }));
}

async function fetchForecastSnapshot(signal?: AbortSignal): Promise<number | null> {
  const res = await fetch(FORECAST_SNAPSHOT_PATH, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`Forecast snapshot responded ${res.status}`);
  const { snapshot } = (await res.json()) as { snapshot?: unknown };
  return typeof snapshot === "number" ? snapshot : null;
}

/** The forecast when we have one, else the past radar. Throws only when neither is available. */
export async function fetchRadarFeed(signal?: AbortSignal): Promise<RadarFeed> {
  try {
    const snapshot = await fetchForecastSnapshot(signal);
    if (snapshot !== null) {
      return {
        kind: "forecast",
        frames: buildForecastFrames(snapshot, window.location.origin),
        attribution: RAINBOW_ATTRIBUTION,
        maxZoom: FORECAST_MAX_ZOOM,
      };
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn("[radar] forecast unavailable, showing the past radar", error);
  }
  return {
    kind: "past",
    frames: await fetchRadarFrames(signal),
    attribution: RAINVIEWER_ATTRIBUTION,
    maxZoom: RAINVIEWER_MAX_ZOOM,
  };
}
