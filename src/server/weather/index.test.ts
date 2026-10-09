import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Circuit } from "@/domain/types";

vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

const { getSessionForecast } = await import("./index");

const silverstone: Circuit = {
  id: "silverstone",
  name: "Silverstone Circuit",
  location: "Silverstone, United Kingdom",
  lat: 52.0786,
  lon: -1.0169,
  timeZone: "Europe/London",
  hasRadarCoverage: true,
};

const T0 = Date.parse("2026-10-09T00:00:00Z") / 1000;
const okBody = {
  hourly: {
    time: [T0, T0 + 3600, T0 + 7200],
    temperature_2m: [10.6, 11.6, 12.4],
    precipitation_probability: [82, 76, 69],
    weather_code: [3, 61, 3],
    wind_speed_10m: [26.6, 26.6, 24.5],
    wind_direction_10m: [222, 226, 230],
    is_day: [0, 0, 0],
  },
};

describe("getSessionForecast", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the forecast for the nearest hour and requests rounded coordinates", async () => {
    const fetchMock = vi.fn(async () => Response.json(okBody));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getSessionForecast(silverstone, "2026-10-09T01:10:00Z");
    expect(result).toMatchObject({ kind: "forecast", weatherCode: 61, temperatureC: 11.6 });
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get("latitude")).toBe("52.08");
    expect(url.searchParams.get("longitude")).toBe("-1.02");
  });

  it("returns unavailable when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(getSessionForecast(silverstone, "2026-10-09T01:00:00Z")).resolves.toEqual({ kind: "unavailable" });
  });

  it("returns unavailable on an HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })));
    await expect(getSessionForecast(silverstone, "2026-10-09T01:00:00Z")).resolves.toEqual({ kind: "unavailable" });
  });

  it("returns unavailable on a malformed body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>oops</html>", { status: 200 })));
    await expect(getSessionForecast(silverstone, "2026-10-09T01:00:00Z")).resolves.toEqual({ kind: "unavailable" });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ hourly: { time: [] } })));
    await expect(getSessionForecast(silverstone, "2026-10-09T01:00:00Z")).resolves.toEqual({ kind: "unavailable" });
  });
});
