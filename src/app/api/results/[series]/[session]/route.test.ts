import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, SessionResult } from "@/domain/types";

const getSeriesPageData = vi.fn();
const getSessionResults = vi.fn();

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/server/results", () => ({ getSessionResults }));
vi.mock("@/app/[series]/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/[series]/data")>()),
  getSeriesPageData,
}));

const { GET } = await import("./route");

const HOUR = 3_600_000;
const ROUND = "f1-2026-marina-bay";

function session(slug: string, endsInHours: number, status: Session["status"] = "scheduled"): Session {
  const end = Date.now() + endsInHours * HOUR;
  return {
    id: `${ROUND}:${slug}`,
    roundId: ROUND,
    series: "f1",
    type: slug === "race" ? "race" : slug === "qualifying" ? "qualifying" : "practice",
    name: slug,
    startsAt: new Date(end - HOUR).toISOString(),
    endsAt: new Date(end).toISOString(),
    endIsEstimated: false,
    status,
  } as Session;
}

const SESSIONS = [session("practice-1", -48), session("practice-2", -24, "cancelled"), session("qualifying", -2), session("race", 20)];
const RESULT: SessionResult = { entries: [{ position: 1, name: "Max Verstappen", team: "Red Bull Racing", time: "1:31.373" }] };

function get(series: string, slug: string) {
  return GET(new Request(`https://motorsportsinfo.app/api/results/${series}/${slug}`), {
    params: Promise.resolve({ series, session: slug }),
  });
}

describe("GET /api/results/[series]/[session]", () => {
  beforeEach(() => {
    getSeriesPageData.mockResolvedValue({
      featured: { kind: "round", round: { season: 2026, sessionTimesConfirmed: true }, sessions: SESSIONS },
    });
    getSessionResults.mockResolvedValue({ [`${ROUND}:qualifying`]: RESULT });
  });

  it("answers a finished Session's Session Result, cacheable and kept out of search", async () => {
    const res = await get("f1", "qualifying");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESULT);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  it("looks results up for the same finished Sessions as the page, so it reads the page's cache entry", async () => {
    await get("f1", "qualifying");
    const [series, season, finished] = getSessionResults.mock.calls[0];
    expect([series, season]).toEqual(["f1", 2026]);
    expect((finished as Session[]).map((s) => s.id)).toEqual([`${ROUND}:practice-1`, `${ROUND}:qualifying`]);
  });

  it("is a 404 for Sessions without one, Sessions still to run, and unknown Series or Sessions", async () => {
    expect((await get("f1", "practice-1")).status).toBe(404);
    expect((await get("f1", "race")).status).toBe(404);
    expect((await get("f1", "practice-2")).status).toBe(404);
    expect((await get("f1", "nope")).status).toBe(404);
    expect((await get("f9", "qualifying")).status).toBe(404);
  });

  it("is a 404 when there is no Round with confirmed times", async () => {
    getSeriesPageData.mockResolvedValue({ featured: { kind: "season-complete", season: 2026 } });
    expect((await get("f1", "qualifying")).status).toBe(404);
  });
});
