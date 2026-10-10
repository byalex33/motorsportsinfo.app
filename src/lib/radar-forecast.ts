// Shared by the forecast radar map (client) and its tile relay (server, src/server/radar).
// Rainbow.ai Tiles API: a snapshot (epoch seconds, on a 10-minute grid) plus a forecast offset.

/** Forecast frames run from the latest snapshot to this far ahead. Rainbow goes to 4 h; 2 h halves the tiles. */
export const FORECAST_HORIZON_S = 2 * 60 * 60;
/** Rainbow's step between forecast frames and between snapshots. */
export const FORECAST_STEP_S = 600;
/** The map's minimum zoom; tiles below it are never needed. */
export const FORECAST_MIN_ZOOM = 4;
/** Tiles are fetched up to this zoom and overzoomed beyond it: each zoom level costs 4× the tiles. */
export const FORECAST_MAX_ZOOM = 7;
/** How far the radar map may pan from the Circuit. Also bounds which tiles the relay will fetch. */
export const RADAR_PAN_DEGREES = { lon: 8, lat: 5 } as const;

export const FORECAST_SNAPSHOT_PATH = "/api/radar/snapshot";
const FORECAST_TILES_PATH = "/api/radar/tiles";

/** Forecast offsets in seconds: 0, 600, …, FORECAST_HORIZON_S. */
export function forecastOffsets(): number[] {
  const offsets: number[] = [];
  for (let s = 0; s <= FORECAST_HORIZON_S; s += FORECAST_STEP_S) offsets.push(s);
  return offsets;
}

/** Our relay's tile URL for one forecast frame. MapLibre needs it absolute, hence `origin`. */
export function forecastTileTemplate(origin: string, snapshot: number, offset: number): string {
  return `${origin}${FORECAST_TILES_PATH}/${snapshot}/${offset}/{z}/{x}/{y}`;
}
