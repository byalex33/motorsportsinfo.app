// CONTRACT — owned by the radar work. Routes under /api/radar import only from here.
// Forecast rain radar from Rainbow.ai (see ADR 0001). Without RAINBOW_API_KEY, past the monthly tile cap or
// the daily sub-cap, or when Rainbow fails, the snapshot is null and the map falls back to RainViewer's past radar.
import "server-only";
import { inArray, sql } from "drizzle-orm";
import { cacheLife } from "next/cache";
import { getDb } from "@/db/client";
import { radarTileUsage } from "@/db/schema";
import { SERIES } from "@/domain/series";
import { SERIES_IDS, type Circuit } from "@/domain/types";
import { getFeaturedRound } from "@/server/schedule";
import { parseForecastTile, parseSnapshot, rainbowSnapshotUrl, rainbowTileUrl, usageDay, usageMonth, type ForecastTile } from "./rainbow";

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

/** A UTC day's share of the month (default a twentieth), so one day of scripted requests can't spend it all. */
function dailyCap(): number {
  const cap = Number(process.env.RAINBOW_DAILY_TILE_CAP || NaN);
  return Number.isFinite(cap) && cap >= 0 ? cap : Math.floor(monthlyCap() / 20);
}

/** The radar_tile_usage keys counted for `now`: the month's row and, beside it, the UTC day's. */
function usageKeys(now: Date): { month: string; day: string } {
  return { month: usageMonth(now), day: usageDay(now) };
}

/** Whether this month's or today's tiles are used up. Fails closed: if the count can't be read, no forecast. */
async function overCap(): Promise<boolean> {
  const db = getDb();
  if (!db) return false; // Local dev without a database: no cap.
  const { month, day } = usageKeys(new Date());
  try {
    const rows = await db
      .select({ month: radarTileUsage.month, tiles: radarTileUsage.tiles })
      .from(radarTileUsage)
      .where(inArray(radarTileUsage.month, [month, day]));
    const used = (key: string) => rows.find((row) => row.month === key)?.tiles ?? 0;
    return used(month) >= monthlyCap() || used(day) >= dailyCap();
  } catch (error) {
    console.warn("[radar] could not read the tile count:", error);
    return true;
  }
}

/**
 * Counts one tile Rainbow sent (after its 200, so an outage or a retry spends nothing) against the month and
 * the day. Tiles fetched at the same moment can each pass overCap first, so a cap can be passed by the few in
 * flight; the remote cache fetches each tile once.
 */
async function countTile(): Promise<void> {
  const db = getDb();
  if (!db) return;
  const { month, day } = usageKeys(new Date());
  try {
    await db
      .insert(radarTileUsage)
      .values([
        { month, tiles: 1 },
        { month: day, tiles: 1 },
      ])
      .onConflictDoUpdate({ target: radarTileUsage.month, set: { tiles: sql`${radarTileUsage.tiles} + 1` } });
  } catch (error) {
    console.warn("[radar] could not count a tile:", error);
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
// so each tile is fetched (and counted) once, however many CDN regions ask for it. Only a tile Rainbow sent
// is counted.
async function cachedForecastTile(snapshot: number, offset: number, z: number, x: number, y: number): Promise<ForecastTileResult> {
  "use cache: remote";
  const key = apiKey();
  if (!key || (await overCap())) {
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
      const png = new Uint8Array(await res.arrayBuffer());
      await countTile();
      cacheLife({ stale: 3600, revalidate: 7200, expire: 7200 });
      return { kind: "ok", png };
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
