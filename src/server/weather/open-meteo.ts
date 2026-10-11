// Open-Meteo access and the pure rules that turn an hourly forecast into a Session's ForecastResult.
// No Next.js imports here so the logic is testable and runnable outside the framework.
import { z } from "zod";
import type { ForecastResult } from "@/domain/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Open-Meteo's forecast reaches at most this far ahead (forecast_days=16). */
export const FORECAST_DAYS = 16;
/** Past days requested too, so earlier Sessions of a Round in progress still show their forecast. */
export const PAST_DAYS = 5;
/** A Session further than this from every hourly value has no usable forecast. */
const MAX_HOUR_DISTANCE_MS = 90 * 60 * 1000;

const HOURLY_VARIABLES = [
  "temperature_2m",
  "precipitation_probability",
  "weather_code",
  "wind_speed_10m",
  "wind_direction_10m",
  "is_day",
] as const;

/** One Circuit's hourly forecast. Plain arrays so it serialises into the Next cache. */
export interface HourlyForecast {
  /** Unix seconds (UTC), one per hour, ascending. */
  time: number[];
  temperatureC: (number | null)[];
  precipitationProbability: (number | null)[];
  weatherCode: (number | null)[];
  windSpeedKmh: (number | null)[];
  windDirectionDeg: (number | null)[];
  isDay: (number | null)[];
}

/** Rounds a coordinate to 2 decimals (~1 km) so nearby callers share one cache entry. */
export function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

export function openMeteoUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: HOURLY_VARIABLES.join(","),
    forecast_days: String(FORECAST_DAYS),
    past_days: String(PAST_DAYS),
    timezone: "GMT",
    timeformat: "unixtime",
    wind_speed_unit: "kmh",
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

const nullableNumbers = z.array(z.number().nullable());
const responseSchema = z.object({
  hourly: z.object({
    time: z.array(z.number()),
    temperature_2m: nullableNumbers,
    precipitation_probability: nullableNumbers,
    weather_code: nullableNumbers,
    wind_speed_10m: nullableNumbers,
    wind_direction_10m: nullableNumbers,
    is_day: nullableNumbers,
  }),
});

/** Validates an Open-Meteo response body. Throws when the shape is not what we asked for. */
export function parseOpenMeteoResponse(body: unknown): HourlyForecast {
  const { hourly } = responseSchema.parse(body);
  const n = hourly.time.length;
  const columns = [
    hourly.temperature_2m,
    hourly.precipitation_probability,
    hourly.weather_code,
    hourly.wind_speed_10m,
    hourly.wind_direction_10m,
    hourly.is_day,
  ];
  if (n === 0 || columns.some((c) => c.length !== n)) {
    throw new Error("Open-Meteo returned hourly arrays of unequal length");
  }
  return {
    time: hourly.time,
    temperatureC: hourly.temperature_2m,
    precipitationProbability: hourly.precipitation_probability,
    weatherCode: hourly.weather_code,
    windSpeedKmh: hourly.wind_speed_10m,
    windDirectionDeg: hourly.wind_direction_10m,
    isDay: hourly.is_day,
  };
}

/** Open-Meteo sheds load with 429/503 when many Circuits are fetched at once (e.g. a build's prerender). */
export const RETRY_DELAY_MS = 750;

class RetryableError extends Error {}

async function fetchOnce(lat: number, lon: number, init?: RequestInit): Promise<HourlyForecast> {
  let res: Response;
  try {
    res = await fetch(openMeteoUrl(lat, lon), { signal: AbortSignal.timeout(10_000), ...init });
  } catch (error) {
    // A 10-second timeout is not worth waiting out twice.
    if (error instanceof Error && error.name === "TimeoutError") throw error;
    throw new RetryableError("Open-Meteo request failed", { cause: error });
  }
  if (!res.ok) {
    await res.body?.cancel();
    const message = `Open-Meteo responded ${res.status}`;
    throw res.status === 429 || res.status >= 500 ? new RetryableError(message) : new Error(message);
  }
  return parseOpenMeteoResponse(await res.json());
}

/**
 * Fetches a Circuit's hourly forecast. Throws on network, HTTP or shape errors, after one retry
 * RETRY_DELAY_MS later for a network error, 429 or 5xx. `init` lets the Next layer add fetch-cache options.
 */
export async function fetchHourlyForecast(lat: number, lon: number, init?: RequestInit): Promise<HourlyForecast> {
  try {
    return await fetchOnce(lat, lon, init);
  } catch (error) {
    if (!(error instanceof RetryableError)) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return fetchOnce(lat, lon, init);
  }
}

function isComplete(h: HourlyForecast, i: number): boolean {
  return (
    h.temperatureC[i] != null &&
    h.precipitationProbability[i] != null &&
    h.weatherCode[i] != null &&
    h.windSpeedKmh[i] != null &&
    h.windDirectionDeg[i] != null &&
    h.isDay[i] != null
  );
}

/**
 * The forecast for a Session: the hourly value nearest its start.
 *
 * - Beyond the last hour with complete data → `not-yet`. `availableFrom` is the Session start minus the
 *   horizon Open-Meteo currently provides for this location (at most 16 days). Regional models end a little
 *   before day 16, so using a fixed 16 days would sometimes give a date that has already passed.
 * - Before the data starts, or no complete hour nearby → `unavailable`.
 */
export function resolveSessionForecast(hourly: HourlyForecast, startsAt: string, now: Date): ForecastResult {
  const start = Date.parse(startsAt);
  if (Number.isNaN(start)) return { kind: "unavailable" };

  let lastComplete = -1;
  for (let i = hourly.time.length - 1; i >= 0; i--) {
    if (isComplete(hourly, i)) {
      lastComplete = i;
      break;
    }
  }
  if (lastComplete < 0) return { kind: "unavailable" };

  const lastCompleteMs = hourly.time[lastComplete] * 1000;
  if (start > lastCompleteMs + HOUR_MS / 2) {
    const horizonMs = Math.min(Math.max(lastCompleteMs - now.getTime(), 0), FORECAST_DAYS * DAY_MS);
    const availableFrom = Math.floor((start - horizonMs) / HOUR_MS) * HOUR_MS;
    return { kind: "not-yet", availableFrom: new Date(availableFrom).toISOString() };
  }

  const nearest = nearestCompleteHour(hourly, start);
  if (nearest < 0) return { kind: "unavailable" };

  return {
    kind: "forecast",
    at: new Date(start).toISOString(),
    weatherCode: hourly.weatherCode[nearest]!,
    isDay: hourly.isDay[nearest] === 1,
    temperatureC: hourly.temperatureC[nearest]!,
    precipitationProbability: hourly.precipitationProbability[nearest]!,
    windSpeedKmh: hourly.windSpeedKmh[nearest]!,
    windDirectionDeg: hourly.windDirectionDeg[nearest]!,
  };
}

/** Index of the complete hour nearest `startMs` (ties go to the later hour), or -1 if none is close enough. */
export function nearestCompleteHour(hourly: HourlyForecast, startMs: number): number {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < hourly.time.length; i++) {
    if (!isComplete(hourly, i)) continue;
    const distance = Math.abs(hourly.time[i] * 1000 - startMs);
    if (distance <= bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return bestDistance <= MAX_HOUR_DISTANCE_MS ? best : -1;
}
