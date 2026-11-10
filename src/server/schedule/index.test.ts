import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRound, makeSession } from "./test-utils";

const loadPublishedSchedule = vi.fn();
const getLiveSchedule = vi.fn();
vi.mock("next/cache", () => ({ io: vi.fn(async () => {}) }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("./db-read", () => ({ loadPublishedSchedule }));
vi.mock("./live", () => ({ getLiveSchedule, LIVE_WAIT_MS: 10_000 }));

const { getFeaturedRound } = await import("./index");

const NOW = new Date("2026-10-30T12:00:00Z");
const round = makeRound("f1-2026-mexico", "mexico-city", "2026-10-30", "2026-11-01", { name: "Mexico City Grand Prix" });
const schedule = [{ round, sessions: [makeSession(round.id, "race", "2026-11-01T20:00:00Z", { type: "race" })] }];

describe("schedule reads with a database", () => {
  beforeEach(() => vi.clearAllMocks());

  it("read the published schedule, not the sources, while the database answers", async () => {
    loadPublishedSchedule.mockResolvedValue(schedule);
    const featured = await getFeaturedRound("f1", NOW);
    expect(featured.kind === "round" && featured.round.id).toBe(round.id);
    expect(getLiveSchedule).not.toHaveBeenCalled();
  });

  it("fall back to the live sources when the database can't be read", async () => {
    loadPublishedSchedule.mockResolvedValue(null);
    getLiveSchedule.mockResolvedValue(schedule);
    const featured = await getFeaturedRound("f1", NOW);
    expect(featured.kind === "round" && featured.round.id).toBe(round.id);
    expect(getLiveSchedule).toHaveBeenCalledWith("f1", { waitMs: 10_000 });
  });

  it("still throw when the live sources fail too, so pages keep their last good render", async () => {
    loadPublishedSchedule.mockResolvedValue(null);
    getLiveSchedule.mockRejectedValue(new Error("source down"));
    await expect(getFeaturedRound("f1", NOW)).rejects.toThrow("source down");
  });
});
