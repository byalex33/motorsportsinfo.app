import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Circuit, FeaturedRoundResult } from "@/domain/types";

const getFeaturedRound = vi.fn<(series: string) => Promise<FeaturedRoundResult>>();
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
/** radar_tile_usage rows by key, behind a stand-in for the few Drizzle calls the counter makes. */
const usage = vi.hoisted(() => ({ rows: new Map<string, number>(), enabled: false }));
const fakeDb = {
  select: () => ({
    from: () => ({ where: async () => [...usage.rows].map(([month, tiles]) => ({ month, tiles })) }),
  }),
  insert: () => ({
    values: (values: { month: string; tiles: number }[]) => ({
      onConflictDoUpdate: async () => {
        for (const { month } of values) usage.rows.set(month, (usage.rows.get(month) ?? 0) + 1);
      },
    }),
  }),
};
vi.mock("@/db/client", () => ({ getDb: () => (usage.enabled ? fakeDb : null) }));
vi.mock("@/server/schedule", () => ({ getFeaturedRound }));

const { forecastTileFromParams, getForecastSnapshot, getForecastTile } = await import("./index");

const circuit = (id: string, lat: number, lon: number, hasRadarCoverage = true): Circuit => ({
  id,
  name: id,
  location: id,
  lat,
  lon,
  timeZone: "Europe/London",
  hasRadarCoverage,
});
const silverstone = circuit("silverstone", 52.0786, -1.0169);
const monza = circuit("monza", 45.6156, 9.2811);

const featured = (c: Circuit): FeaturedRoundResult => ({
  kind: "round",
  round: {
    id: "f1-2026-x",
    series: "f1",
    season: 2026,
    slug: "x",
    name: "Grand Prix",
    circuitId: c.id,
    startDate: "2026-10-09",
    endDate: "2026-10-11",
    sessionTimesConfirmed: true,
  },
  roundNumber: 18,
  circuit: c,
  sessions: [],
});

const LATEST = 1791636000;
// z7 tile containing Silverstone, well west of Monza's pan box.
const nearSilverstone = { snapshot: String(LATEST), offset: "3600", z: "7", x: "63", y: "42" };

describe("forecastTileFromParams", () => {
  beforeEach(() => {
    vi.stubEnv("RAINBOW_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ snapshot: LATEST })));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    getFeaturedRound.mockResolvedValue(featured(silverstone));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    getFeaturedRound.mockReset();
  });

  it("accepts a tile near the F1 Featured Round's Circuit for the latest snapshot", async () => {
    await expect(forecastTileFromParams(nearSilverstone)).resolves.toEqual({
      snapshot: LATEST,
      offset: 3600,
      z: 7,
      x: 63,
      y: 42,
    });
    expect(getFeaturedRound).toHaveBeenCalledWith("f1");
  });

  it("rejects tiles near another Circuit", async () => {
    getFeaturedRound.mockResolvedValue(featured(monza));
    await expect(forecastTileFromParams(nearSilverstone)).resolves.toBeNull();
  });

  it("rejects a snapshot older than the two before the latest", async () => {
    await expect(forecastTileFromParams({ ...nearSilverstone, snapshot: String(LATEST - 1800) })).resolves.toBeNull();
  });

  it("fails closed when there is no Featured Round, no radar coverage or the schedule can't be read", async () => {
    getFeaturedRound.mockResolvedValue({ kind: "season-complete", season: 2026 });
    await expect(forecastTileFromParams(nearSilverstone)).resolves.toBeNull();
    getFeaturedRound.mockResolvedValue(featured(circuit("silverstone", 52.0786, -1.0169, false)));
    await expect(forecastTileFromParams(nearSilverstone)).resolves.toBeNull();
    getFeaturedRound.mockRejectedValue(new Error("database down"));
    await expect(forecastTileFromParams(nearSilverstone)).resolves.toBeNull();
  });

  it("fails closed when Rainbow's latest snapshot is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    await expect(forecastTileFromParams(nearSilverstone)).resolves.toBeNull();
    vi.stubEnv("RAINBOW_API_KEY", "");
    await expect(forecastTileFromParams(nearSilverstone)).resolves.toBeNull();
  });
});

describe("the Rainbow tile caps", () => {
  const NOW = new Date("2026-11-10T12:00:00Z");
  const tile = (x: number) => ({ snapshot: LATEST, offset: 3600, z: 7, x, y: 42 });
  const png = () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } });
  let upstream: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.stubEnv("RAINBOW_API_KEY", "test-key");
    vi.stubEnv("RAINBOW_MONTHLY_TILE_CAP", "100");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    usage.enabled = true;
    usage.rows.clear();
    upstream = vi.fn(async () => png());
    vi.stubGlobal("fetch", upstream);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    usage.enabled = false;
  });

  it("counts a tile against both the month and the UTC day once Rainbow answers 200", async () => {
    await expect(getForecastTile(tile(63))).resolves.toMatchObject({ kind: "ok" });
    expect(usage.rows.get("2026-11")).toBe(1);
    expect(usage.rows.get("2026-11-10")).toBe(1);
  });

  it("stops at the daily sub-cap (a twentieth of the month by default), so one day can't spend the month", async () => {
    const results = [];
    for (let x = 0; x < 8; x++) results.push((await getForecastTile(tile(x))).kind);
    expect(results).toEqual(["ok", "ok", "ok", "ok", "ok", "unavailable", "unavailable", "unavailable"]);
    expect(upstream).toHaveBeenCalledTimes(5);
    expect(usage.rows.get("2026-11-10")).toBe(5);
    await expect(getForecastSnapshot()).resolves.toBeNull();
  });

  it("takes the daily sub-cap from RAINBOW_DAILY_TILE_CAP", async () => {
    vi.stubEnv("RAINBOW_DAILY_TILE_CAP", "2");
    usage.rows.set("2026-11-10", 2);
    await expect(getForecastTile(tile(1))).resolves.toEqual({ kind: "unavailable" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("stops at the monthly cap whatever the day", async () => {
    usage.rows.set("2026-11", 100);
    await expect(getForecastTile(tile(1))).resolves.toEqual({ kind: "unavailable" });
    expect(upstream).not.toHaveBeenCalled();
    await expect(getForecastSnapshot()).resolves.toBeNull();
  });

  it("does not count a tile Rainbow failed to send", async () => {
    upstream.mockResolvedValueOnce(new Response("down", { status: 503 }));
    await expect(getForecastTile(tile(1))).resolves.toEqual({ kind: "unavailable" });
    upstream.mockRejectedValueOnce(new Error("timeout"));
    await expect(getForecastTile(tile(2))).resolves.toEqual({ kind: "unavailable" });
    upstream.mockResolvedValueOnce(new Response("no", { status: 404 }));
    await expect(getForecastTile(tile(3))).resolves.toEqual({ kind: "not-found" });
    expect(usage.rows.size).toBe(0);
  });
});
