import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RETRY_DELAY_MS,
  fetchHourlyForecast,
  nearestCompleteHour,
  openMeteoUrl,
  parseOpenMeteoResponse,
  resolveSessionForecast,
  roundCoord,
  type HourlyForecast,
} from "./open-meteo";

const T0 = Date.parse("2026-10-04T00:00:00Z") / 1000;

/** `hours` hourly rows from T0; rows at or after `completeHours` have null values like Open-Meteo's tail. */
function hourly(hours: number, completeHours = hours): HourlyForecast {
  const h: HourlyForecast = {
    time: [],
    temperatureC: [],
    precipitationProbability: [],
    weatherCode: [],
    windSpeedKmh: [],
    windDirectionDeg: [],
    isDay: [],
  };
  for (let i = 0; i < hours; i++) {
    const ok = i < completeHours;
    h.time.push(T0 + i * 3600);
    h.temperatureC.push(ok ? i : null);
    h.precipitationProbability.push(ok ? i % 101 : null);
    h.weatherCode.push(ok ? 3 : null);
    h.windSpeedKmh.push(ok ? 10 + i : null);
    h.windDirectionDeg.push(ok ? (i * 10) % 360 : null);
    h.isDay.push(i % 24 >= 7 && i % 24 < 19 ? 1 : 0);
  }
  return h;
}

const iso = (hoursFromT0: number) => new Date((T0 + hoursFromT0 * 3600) * 1000).toISOString();
const now = new Date(iso(5 * 24 + 1.5)); // data starts 5 past days before "now"

describe("roundCoord / openMeteoUrl", () => {
  it("rounds to 2 decimals", () => {
    expect(roundCoord(52.0786)).toBe(52.08);
    expect(roundCoord(-1.01694)).toBe(-1.02);
  });

  it("builds the forecast URL with the agreed parameters", () => {
    const url = new URL(openMeteoUrl(52.08, -1.02));
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("52.08");
    expect(url.searchParams.get("longitude")).toBe("-1.02");
    expect(url.searchParams.get("hourly")).toBe(
      "temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,is_day",
    );
    expect(url.searchParams.get("forecast_days")).toBe("16");
    expect(url.searchParams.get("timezone")).toBe("GMT");
    expect(url.searchParams.get("wind_speed_unit")).toBe("kmh");
    expect(url.searchParams.has("models")).toBe(false); // default best_match
  });
});

describe("nearest-hour selection", () => {
  const h = hourly(48);

  it("picks the exact hour", () => {
    expect(nearestCompleteHour(h, Date.parse(iso(10)))).toBe(10);
  });

  it("rounds to the nearest hour either way", () => {
    expect(nearestCompleteHour(h, Date.parse(iso(10.25)))).toBe(10);
    expect(nearestCompleteHour(h, Date.parse(iso(10.75)))).toBe(11);
  });

  it("breaks a half-hour tie towards the later hour", () => {
    expect(nearestCompleteHour(h, Date.parse(iso(10.5)))).toBe(11);
  });

  it("skips incomplete hours", () => {
    const gappy = hourly(48);
    gappy.weatherCode[11] = null;
    expect(nearestCompleteHour(gappy, Date.parse(iso(10.9)))).toBe(10);
  });

  it("returns the values of that hour for a Session", () => {
    const result = resolveSessionForecast(h, "2026-10-04T14:20:00Z", now);
    expect(result).toEqual({
      kind: "forecast",
      at: "2026-10-04T14:20:00.000Z",
      weatherCode: 3,
      isDay: true,
      temperatureC: 14,
      precipitationProbability: 14,
      windSpeedKmh: 24,
      windDirectionDeg: 140,
    });
  });

  it("reports night hours", () => {
    const result = resolveSessionForecast(h, iso(22), now);
    expect(result.kind === "forecast" && result.isDay).toBe(false);
  });
});

describe("horizon / not-yet", () => {
  // 21 days of rows, complete for the first 19.5 days (Open-Meteo leaves the tail null).
  const h = hourly(21 * 24, 19 * 24 + 12);
  const lastComplete = 19 * 24 + 11;

  it("forecasts within the horizon", () => {
    expect(resolveSessionForecast(h, iso(lastComplete), now).kind).toBe("forecast");
    expect(resolveSessionForecast(h, iso(lastComplete + 0.5), now).kind).toBe("forecast");
  });

  it("is not-yet beyond the last complete hour", () => {
    const result = resolveSessionForecast(h, iso(lastComplete + 0.6), now);
    expect(result.kind).toBe("not-yet");
  });

  it("gives availableFrom as start minus the current horizon, always after now", () => {
    const start = iso(lastComplete + 3 * 24);
    const result = resolveSessionForecast(h, start, now);
    // horizon = lastComplete - now; availableFrom ≈ now + 3 days, floored to the hour
    expect(result).toEqual({ kind: "not-yet", availableFrom: "2026-10-12T01:00:00.000Z" });
    if (result.kind === "not-yet") expect(Date.parse(result.availableFrom)).toBeGreaterThan(now.getTime());
  });

  it("caps the horizon at 16 days", () => {
    const longData = hourly(40 * 24);
    const start = "2026-12-01T12:00:00Z";
    const result = resolveSessionForecast(longData, start, now);
    expect(result).toEqual({
      kind: "not-yet",
      availableFrom: new Date(Date.parse(start) - 16 * 24 * 3600 * 1000).toISOString(),
    });
  });

  it("is unavailable for a Session before the data starts", () => {
    expect(resolveSessionForecast(h, iso(-3), now)).toEqual({ kind: "unavailable" });
  });

  it("is unavailable for an invalid start or empty data", () => {
    expect(resolveSessionForecast(h, "not a date", now)).toEqual({ kind: "unavailable" });
    expect(resolveSessionForecast(hourly(24, 0), iso(1), now)).toEqual({ kind: "unavailable" });
  });
});

describe("parseOpenMeteoResponse", () => {
  const body = {
    latitude: 52.07,
    hourly: {
      time: [T0, T0 + 3600],
      temperature_2m: [10.6, null],
      precipitation_probability: [82, null],
      weather_code: [3, null],
      wind_speed_10m: [26.6, null],
      wind_direction_10m: [222, null],
      is_day: [0, 0],
    },
  };

  it("maps the hourly arrays", () => {
    const h = parseOpenMeteoResponse(body);
    expect(h.time).toEqual([T0, T0 + 3600]);
    expect(h.temperatureC).toEqual([10.6, null]);
    expect(h.windDirectionDeg).toEqual([222, null]);
  });

  it("rejects error bodies and mismatched arrays", () => {
    expect(() => parseOpenMeteoResponse({ error: true, reason: "Latitude must be in range" })).toThrow();
    expect(() =>
      parseOpenMeteoResponse({ hourly: { ...body.hourly, is_day: [0] } }),
    ).toThrow(/unequal/);
  });
});

describe("fetchHourlyForecast", () => {
  const body = {
    hourly: {
      time: [T0],
      temperature_2m: [10.6],
      precipitation_probability: [82],
      weather_code: [3],
      wind_speed_10m: [26.6],
      wind_direction_10m: [222],
      is_day: [0],
    },
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Starts the fetch, then lets the retry backoff elapse. */
  async function run() {
    const result = fetchHourlyForecast(52.08, -1.02).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    return result;
  }

  it.each([
    ["429", () => new Response("rate limited", { status: 429 })],
    ["503", () => new Response("busy", { status: 503 })],
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
  ])("retries once after %s", async (_name, first) => {
    const fetchMock = vi.fn().mockImplementationOnce(first).mockImplementationOnce(async () => Response.json(body));
    vi.stubGlobal("fetch", fetchMock);
    const result = await run();
    expect(result).toMatchObject({ ok: true, value: { time: [T0], temperatureC: [10.6] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry fails too", async () => {
    const fetchMock = vi.fn(async () => new Response("busy", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await run();
    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry other HTTP errors, a timeout or a malformed body", async () => {
    const badRequest = vi.fn(async () => new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", badRequest);
    expect((await run()).ok).toBe(false);
    expect(badRequest).toHaveBeenCalledTimes(1);

    const timeout = vi.fn(async () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")));
    vi.stubGlobal("fetch", timeout);
    expect((await run()).ok).toBe(false);
    expect(timeout).toHaveBeenCalledTimes(1);

    const malformed = vi.fn(async () => Response.json({ hourly: { time: [] } }));
    vi.stubGlobal("fetch", malformed);
    expect((await run()).ok).toBe(false);
    expect(malformed).toHaveBeenCalledTimes(1);
  });

  it("waits before retrying", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => new Response("busy", { status: 503 }))
      .mockImplementationOnce(async () => Response.json(body));
    vi.stubGlobal("fetch", fetchMock);
    const pending = fetchHourlyForecast(52.08, -1.02);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
