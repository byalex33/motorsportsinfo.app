// CONTRACT — owned by the radar work. Routes under /api/radar import only from here.
// Forecast rain radar from Rainbow.ai (see ADR 0001). Without RAINBOW_API_KEY, past the monthly tile cap,
// or when Rainbow fails, the snapshot is null and the map falls back to RainViewer's past radar.
import "server-only";
import { eq, sql } from "drizzle-orm";
import { cacheLife } from "next/cache";
import { getDb } from "@/db/client";
import { radarTileUsage } from "@/db/schema";
import { SERIES } from "@/domain/series";
import { SERIES_IDS, type Circuit } from "@/domain/types";
import { getFeaturedRound } from "@/server/schedule";
import { parseForecastTile, parseSnapshot, rainbowSnapshotUrl, rainbowTileUrl, usageMonth, type ForecastTile } from "./rainbow";

/** Rainbow's free tier is 30,000 tiles a month; past the cap the map shows the past radar instead. */
const DEFAULT_MONTHLY_TILE_CAP = 30_000;
const TIMEOUT_MS = 10_000;
/** Rainbow publishes a snapshot every 10 minutes; a minute's cache keeps upstream calls to a few an hour. */
const SNAPSHOT_LIFE = { stale: 60, revalidate: 60, expire: 300 };
const RADAR_SERIES = SERIES_IDS.filter((id) => SERIES[id].hasRainRadar);

function apiKey(): string | null {
  return process.env.RAINBOW_API_KEY || null;
}

function monthlyCap(): number {
  const cap = Number(process.env.RAINBOW_MONTHLY_TILE_CAP);
  return Number.isFinite(cap) && cap >= 0 ? cap : DEFAULT_MONTHLY_TILE_CAP;
}

/** Whether this month's tiles are used up. Fails closed: if the count can't be read, no forecast. */
async function overCap(): Promise<boolean> {
  const db = getDb();
  if (!db) return false; // Local dev without a database: no cap.
  try {
    const [row] = await db
      .select({ tiles: radarTileUsage.tiles })
      .from(radarTileUsage)
      .where(eq(radarTileUsage.month, usageMonth(new Date())));
    return (row?.tiles ?? 0) >= monthlyCap();
  } catch (error) {
    console.warn("[radar] could not read the tile count:", error);
    return true;
  }
}

/** Counts one upstream tile fetch; false when the cap is reached or the count can't be written. */
async function takeTile(): Promise<boolean> {
  const db = getDb();
  if (!db) return true;
  try {
    const [row] = await db
      .insert(radarTileUsage)
      .values({ month: usageMonth(new Date()), tiles: 1 })
      .onConflictDoUpdate({ target: radarTileUsage.month, set: { tiles: sql`${radarTileUsage.tiles} + 1` } })
      .returning({ tiles: radarTileUsage.tiles });
    return row.tiles <= monthlyCap();
  } catch (error) {
    console.warn("[radar] could not count a tile:", error);
    return false;
  }
}

/** Rainbow's latest snapshot (epoch seconds), or null when the forecast radar is unavailable. */
export async function getForecastSnapshot(): Promise<number | null> {
  if (!apiKey() || (await overCap())) return null;
  return latestSnapshot();
}

// One cached value for the snapshot route and the tile relay, so the relay accepts exactly the snapshots
// viewers were given. The remote cache is shared by every instance.
async function latestSnapshot(): Promise<number | null> {
  "use cache: remote";
  cacheLife(SNAPSHOT_LIFE);
  const key = apiKey();
  if (!key) return null;
  try {
    const res = await fetch(rainbowSnapshotUrl(), {
      headers: { "Ocp-Apim-Subscription-Key": key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Rainbow responded ${res.status}`);
    const snapshot = parseSnapshot(await res.json());
    if (snapshot === null) throw new Error("Unexpected Rainbow snapshot payload");
    return snapshot;
  } catch (error) {
    console.warn("[radar] Rainbow snapshot unavailable:", error);
    return null;
  }
}

/**
 * The Circuits a radar map can be open for: the Featured Round's, for each Series with a rain radar (F1).
 * The schedule read is cached. Empty when it fails, so the relay fetches nothing.
 */
async function radarCircuits(): Promise<Circuit[]> {
  try {
    const featured = await Promise.all(RADAR_SERIES.map((id) => getFeaturedRound(id)));
    return featured.flatMap((f) => (f.kind === "round" && f.circuit.hasRadarCoverage ? [f.circuit] : []));
  } catch (error) {
    console.warn("[radar] could not read the Featured Round:", error);
    return [];
  }
}

export type ForecastTileResult = { kind: "ok"; png: Uint8Array } | { kind: "not-found" } | { kind: "unavailable" };

/**
 * Checks a relay request's path segments against the latest snapshot and the Featured Round's Circuit;
 * null for a tile we won't fetch. Fails closed: without a snapshot or a Circuit, nothing is fetched.
 */
export async function forecastTileFromParams(params: {
  snapshot: string;
  offset: string;
  z: string;
  x: string;
  y: string;
}): Promise<ForecastTile | null> {
  const [latest, circuits] = await Promise.all([latestSnapshot(), radarCircuits()]);
  if (latest === null || circuits.length === 0) return null;
  return parseForecastTile(params, latest, circuits);
}

export async function getForecastTile(tile: ForecastTile): Promise<ForecastTileResult> {
  if (!apiKey()) return { kind: "unavailable" };
  return cachedForecastTile(tile.snapshot, tile.offset, tile.z, tile.x, tile.y);
}

// A tile for a given snapshot and offset never changes. The remote cache is shared by every instance,
// so each tile is fetched (and counted) once, however many CDN regions ask for it.
async function cachedForecastTile(snapshot: number, offset: number, z: number, x: number, y: number): Promise<ForecastTileResult> {
  "use cache: remote";
  const key = apiKey();
  if (!key || !(await takeTile())) {
    cacheLife({ stale: 60, revalidate: 60, expire: 300 });
    return { kind: "unavailable" };
  }
  try {
    const res = await fetch(rainbowTileUrl({ snapshot, offset, z, x, y }), {
      headers: { "Ocp-Apim-Subscription-Key": key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const isPng = /^image\/png\b/i.test(res.headers.get("content-type") ?? "");
    if (res.ok && isPng) {
      cacheLife({ stale: 3600, revalidate: 7200, expire: 7200 });
      return { kind: "ok", png: new Uint8Array(await res.arrayBuffer()) };
    }
    await res.body?.cancel();
    cacheLife({ stale: 60, revalidate: 60, expire: 300 });
    if (res.status === 400 || res.status === 404) return { kind: "not-found" };
    console.warn(`[radar] Rainbow tile ${snapshot}/${offset}/${z}/${x}/${y} responded ${res.status}`);
    return { kind: "unavailable" };
  } catch (error) {
    console.warn(`[radar] Rainbow tile ${snapshot}/${offset}/${z}/${x}/${y} failed:`, error);
    cacheLife({ stale: 60, revalidate: 60, expire: 300 });
    return { kind: "unavailable" };
  }
}
