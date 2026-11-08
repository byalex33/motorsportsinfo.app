import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SeriesId } from "@/domain/types";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));

const schedule = vi.hoisted(() => ({
  listScheduleRounds: vi.fn(),
  getScheduleUpdatedAt: vi.fn(),
  getRoundUpdatedAt: vi.fn(),
  listSpecialEvents: vi.fn(),
}));
vi.mock("@/server/schedule", () => schedule);

const pageData = vi.hoisted(() => ({ getSeriesPageData: vi.fn() }));
vi.mock("./[series]/data", () => pageData);

// Stands in for the real index (its own tests cover it): one page per listed Round.
vi.mock("@/lib/seo/round-page", () => ({
  indexRoundPages: (rounds: { round: { id: string } }[]) =>
    rounds.map((r) => ({ ...r, path: `/${r.round.id.replace(/-(\d{4})-/, "/$1/")}` })),
}));

const { default: sitemap } = await import("./sitemap");

const FAILING: SeriesId = "imsa";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  schedule.listSpecialEvents.mockReturnValue([]);
  schedule.getRoundUpdatedAt.mockResolvedValue(null);
  schedule.getScheduleUpdatedAt.mockResolvedValue({});
  pageData.getSeriesPageData.mockResolvedValue({ featured: { kind: "none" }, documents: null });
  schedule.listScheduleRounds.mockImplementation(async (id: SeriesId) => {
    if (id === FAILING) throw new Error("All sources failed for imsa: imsa-ecal: IMSA_CALENDAR_URL is not set");
    return id === "f1" ? [{ round: { id: "f1-2026-cota" } }] : [];
  });
});

describe("sitemap", () => {
  it("still lists every Series page when one Series' schedule can't be read, without that Series' Rounds", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://motorsportsinfo.app/imsa");
    expect(urls).toContain("https://motorsportsinfo.app/f1");
    expect(urls).toContain("https://motorsportsinfo.app/f1/2026/cota");
    expect(urls.some((u) => u.startsWith("https://motorsportsinfo.app/imsa/"))).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/^\[sitemap:imsa\] .*IMSA_CALENDAR_URL is not set/));
  });

  it("dates a Series page whose data can't be read with the build time", async () => {
    pageData.getSeriesPageData.mockImplementation(async (id: SeriesId) => {
      if (id === FAILING) throw new Error("database down");
      return { featured: { kind: "none" }, documents: null };
    });
    const entries = await sitemap();
    const home = entries.find((e) => e.url === "https://motorsportsinfo.app/");
    const imsa = entries.find((e) => e.url === "https://motorsportsinfo.app/imsa");
    expect(imsa?.lastModified).toEqual(home?.lastModified);
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/^\[sitemap:imsa\] .*database down/));
  });
});
