// Rainbow.ai Tiles API (precipitation nowcast). https://doc.rainbow.ai/api-ref/tiles/
// The key never reaches the browser: the radar map asks our relay, which checks the request, counts it
// against the monthly tile cap and fetches from Rainbow with the key in a header.
import type { Circuit } from "@/domain/types";
import {
  FORECAST_HORIZON_S,
  FORECAST_MAX_ZOOM,
  FORECAST_MIN_ZOOM,
  FORECAST_STEP_S,
  RADAR_PAN_DEGREES,
} from "@/lib/radar-forecast";

export const RAINBOW_API = "https://api.rainbow.ai/tiles/v1";
/** The radar-based layer; `precip-global` blends in satellite estimates and looks different. */
const LAYER = "precip";
/** Palette 8 = RainViewer Universal Blue, the same colours as the past radar. */
const COLOR = 8;
/**
 * Snapshots before the latest that are still served. The map keeps the snapshot it was given until its
 * 5-minute refresh, and /api/radar/snapshot is cached for 2 minutes at the CDN, so a viewer is usually at
 * most one snapshot behind; the second covers a refresh that failed or was delayed by a sleeping tab.
 */
export const PREVIOUS_SNAPSHOTS = 2;

export interface ForecastTile {
  snapshot: number;
  offset: number;
  z: number;
  x: number;
  y: number;
}

function int(value: string): number | null {
  return /^\d{1,10}$/.test(value) ? Number(value) : null;
}

/**
 * The tile a relay request names, or null if it is malformed, not the latest snapshot (or one of the
 * PREVIOUS_SNAPSHOTS before it), outside the forecast window or zooms, or not near one of `circuits`:
 * the Circuits whose radar map can be open now. Each tile we accept may be a counted upstream fetch.
 */
export function parseForecastTile(
  params: { snapshot: string; offset: string; z: string; x: string; y: string },
  latestSnapshot: number,
  circuits: readonly Pick<Circuit, "lat" | "lon">[],
): ForecastTile | null {
  const snapshot = int(params.snapshot);
  const offset = int(params.offset);
  const z = int(params.z);
  const x = int(params.x);
  const y = int(params.y);
  if (snapshot === null || offset === null || z === null || x === null || y === null) return null;
  // Never newer than the latest: a snapshot Rainbow hasn't published yet would cache a "not found" tile.
  if (
    snapshot % FORECAST_STEP_S !== 0 ||
    snapshot > latestSnapshot ||
    snapshot < latestSnapshot - PREVIOUS_SNAPSHOTS * FORECAST_STEP_S
  ) {
    return null;
  }
  if (offset % FORECAST_STEP_S !== 0 || offset > FORECAST_HORIZON_S) return null;
  if (z < FORECAST_MIN_ZOOM || z > FORECAST_MAX_ZOOM) return null;
  const n = 2 ** z;
  if (x >= n || y >= n) return null;
  if (!circuits.some((c) => tileNearCircuit(z, x, y, c))) return null;
  return { snapshot, offset, z, x, y };
}

function tileLat(y: number, n: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
}

/** Whether a web-mercator tile overlaps the area the radar map can pan to around a Circuit. */
export function tileNearCircuit(z: number, x: number, y: number, c: Pick<Circuit, "lat" | "lon">): boolean {
  const n = 2 ** z;
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;
  const north = tileLat(y, n);
  const south = tileLat(y + 1, n);
  return (
    east >= c.lon - RADAR_PAN_DEGREES.lon &&
    west <= c.lon + RADAR_PAN_DEGREES.lon &&
    north >= c.lat - RADAR_PAN_DEGREES.lat &&
    south <= c.lat + RADAR_PAN_DEGREES.lat
  );
}

export function rainbowSnapshotUrl(): string {
  return `${RAINBOW_API}/snapshot?layer=${LAYER}`;
}

export function rainbowTileUrl({ snapshot, offset, z, x, y }: ForecastTile): string {
  return `${RAINBOW_API}/${LAYER}/${snapshot}/${offset}/${z}/${x}/${y}?color=${COLOR}`;
}

/** The snapshot from Rainbow's `{ "snapshot": 1754991000 }`, or null for anything else. */
export function parseSnapshot(payload: unknown): number | null {
  const snapshot = (payload as { snapshot?: unknown } | null)?.snapshot;
  return typeof snapshot === "number" && Number.isInteger(snapshot) && snapshot > 0 && snapshot % FORECAST_STEP_S === 0
    ? snapshot
    : null;
}

/** "2026-10" in UTC: the month the tile cap counts against. */
export function usageMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}
