import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Circuit, FeaturedRoundResult } from "@/domain/types";

const getFeaturedRound = vi.fn<(series: string) => Promise<FeaturedRoundResult>>();
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: () => null }));
vi.mock("@/server/schedule", () => ({ getFeaturedRound }));

const { forecastTileFromParams } = await import("./index");

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
