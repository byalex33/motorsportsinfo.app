// RainViewer public Weather Maps API (free tier). Frame paths are opaque hashes: always build tile URLs
// from `host` + `path`, never from timestamps. https://www.rainviewer.com/api/weather-maps-api.html

export const RAINVIEWER_MAPS_URL = "https://api.rainviewer.com/public/weather-maps.json";
/** RainViewer serves real radar tiles up to this zoom; higher zooms return placeholders, so MapLibre overzooms. */
export const RAINVIEWER_MAX_ZOOM = 7;
export const RADAR_TILE_SIZE = 256;
/** Colour scheme 2 = Universal Blue, the only scheme on the free tier. */
const COLOR_SCHEME = 2;
/** `{smooth}_{snow}`: smoothed, snow shown in its own colours. */
const TILE_OPTIONS = "1_1";
export const RAINVIEWER_ATTRIBUTION = '<a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>';

export interface WeatherMaps {
  host: string;
  radar: { past: { time: number; path: string }[] };
}

export interface RadarFrame {
  /** Unix seconds the radar image was taken. */
  time: number;
  /** Stable id derived from the path hash, safe for MapLibre source/layer ids. */
  id: string;
  tileUrl: string;
}

function isWeatherMaps(value: unknown): value is WeatherMaps {
  if (!value || typeof value !== "object") return false;
  const v = value as { host?: unknown; radar?: { past?: unknown } };
  return (
    typeof v.host === "string" &&
    /^https:\/\//.test(v.host) &&
    Array.isArray(v.radar?.past) &&
    v.radar.past.every(
      (f: unknown) =>
        !!f &&
        typeof (f as { time?: unknown }).time === "number" &&
        typeof (f as { path?: unknown }).path === "string",
    )
  );
}

/** Past radar frames, oldest first, with their MapLibre tile URL templates. Throws on an unexpected payload. */
export function buildRadarFrames(payload: unknown): RadarFrame[] {
  if (!isWeatherMaps(payload)) throw new Error("Unexpected RainViewer weather-maps.json payload");
  const host = payload.host.replace(/\/+$/, "");
  return payload.radar.past
    .filter((f) => f.path.startsWith("/"))
    .slice()
    .sort((a, b) => a.time - b.time)
    .map((f) => ({
      time: f.time,
      id: `radar-${f.path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      tileUrl: `${host}${f.path}/${RADAR_TILE_SIZE}/{z}/{x}/{y}/${COLOR_SCHEME}/${TILE_OPTIONS}.png`,
    }));
}

export async function fetchRadarFrames(signal?: AbortSignal): Promise<RadarFrame[]> {
  const res = await fetch(RAINVIEWER_MAPS_URL, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`RainViewer responded ${res.status}`);
  return buildRadarFrames(await res.json());
}

/** "14:20" in the viewer's local time (24-hour). */
export function formatFrameClock(time: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(
    new Date(time * 1000),
  );
}

/** "just now", "1 min ago", "40 min ago", "2 h 5 min ago". */
export function formatFrameAge(time: number, nowMs: number): string {
  const minutes = Math.max(0, Math.round((nowMs - time * 1000) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min ago` : `${h} h ago`;
}
