// CONTRACT — owned by the weather work. UI code imports only from here.
// Weather data by Open-Meteo.com (free tier, no key) — see ADR 0001 for the credit obligation.
import { cacheLife } from "next/cache";
import type { Circuit, ForecastResult } from "@/domain/types";
import { fetchHourlyForecast, resolveSessionForecast, roundCoord, type HourlyForecast } from "./open-meteo";

const ONE_HOUR_S = 60 * 60;
/** Failures are cached briefly: a retry a minute later, without hammering Open-Meteo while it is down. */
const FAILURE_LIFE = { stale: 60, revalidate: 60, expire: 300 };

type LoadedForecast = { ok: true; hourly: HourlyForecast } | { ok: false };

/**
 * Open-Meteo forecast at the circuit for a Session's start time.
 * Never throws: failures become `{ kind: "unavailable" }`.
 */
export async function getSessionForecast(circuit: Circuit, startsAt: string): Promise<ForecastResult> {
  try {
    return await cachedSessionForecast(roundCoord(circuit.lat), roundCoord(circuit.lon), startsAt);
  } catch (error) {
    console.warn(`[weather] forecast unavailable for ${circuit.id} at ${startsAt}:`, error);
    return { kind: "unavailable" };
  }
}

// Cached per Session so the clock read for "not-yet" happens inside a cache scope, which keeps
// callers prerenderable.
async function cachedSessionForecast(lat: number, lon: number, startsAt: string): Promise<ForecastResult> {
  "use cache";
  const loaded = await circuitHourlyForecast(lat, lon);
  if (!loaded.ok) {
    cacheLife(FAILURE_LIFE);
    return { kind: "unavailable" };
  }
  cacheLife("hours");
  return resolveSessionForecast(loaded.hourly, startsAt, new Date());
}

// One Open-Meteo request per Circuit covers all its Sessions. The in-memory `use cache` entry is
// backed by the fetch data cache (200 responses only), which persists across serverless instances.
async function circuitHourlyForecast(lat: number, lon: number): Promise<LoadedForecast> {
  "use cache";
  try {
    const hourly = await fetchHourlyForecast(lat, lon, { next: { revalidate: ONE_HOUR_S } });
    cacheLife("hours");
    return { ok: true, hourly };
  } catch (error) {
    console.warn(`[weather] Open-Meteo request failed for ${lat},${lon}:`, error);
    cacheLife(FAILURE_LIFE);
    return { ok: false };
  }
}
