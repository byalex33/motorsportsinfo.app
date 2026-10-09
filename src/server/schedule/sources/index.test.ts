import { describe, expect, it } from "vitest";
import { fixture } from "../test-utils";
import { API_USER_AGENT, type SourceContext } from "./http";
import { fetchSeriesSchedule, SourceFailure } from "./index";

const NOW = new Date("2026-10-09T02:00:00Z");

/** A fake fetch serving fixtures by URL; anything else is a 404. Records requests. */
function fakeContext(routes: Record<string, string | number>) {
  const requests: { url: string; userAgent: string | null }[] = [];
  const ctx: SourceContext = {
    sleep: async () => {},
    fetch: async (url, init) => {
      requests.push({ url, userAgent: new Headers(init?.headers).get("user-agent") });
      const route = routes[url];
      if (typeof route === "number") return new Response("error", { status: route });
      if (route === undefined) return new Response("not found", { status: 404 });
      return new Response(fixture(route), { status: 200 });
    },
  };
  return { ctx, requests };
}

describe("fetchSeriesSchedule", () => {
  it("reads F1 from OpenF1 (this season and next) with the descriptive User-Agent", async () => {
    const { ctx, requests } = fakeContext({
      "https://api.openf1.org/v1/meetings?year=2026": "openf1-meetings-2026.json",
      "https://api.openf1.org/v1/sessions?year=2026": "openf1-sessions-2026.json",
      "https://api.openf1.org/v1/meetings?year=2027": "openf1-meetings-2027.json",
      "https://api.openf1.org/v1/sessions?year=2027": "openf1-sessions-2027.json",
    });
    const schedule = await fetchSeriesSchedule("f1", NOW, ctx);
    expect(schedule).toMatchObject({ source: "openf1", isFallback: false, completeSeasons: [2026, 2027], problems: [] });
    expect(schedule.rounds.map((r) => r.round.id)).toContain("f1-2027-sakhir");
    expect(requests.every((r) => r.userAgent === API_USER_AGENT)).toBe(true);
  });

  it("falls back to Jolpica when OpenF1 fails", async () => {
    const { ctx } = fakeContext({
      "https://api.openf1.org/v1/meetings?year=2026": 429,
      "https://api.jolpi.ca/ergast/f1/2026/races/?limit=100": "jolpica-2026.json",
    });
    const schedule = await fetchSeriesSchedule("f1", NOW, ctx);
    expect(schedule).toMatchObject({ source: "jolpica", isFallback: true });
    expect(schedule.warnings[0]).toContain("HTTP 429");
    expect(schedule.rounds).toHaveLength(3);
  });

  it("throws a SourceFailure when every source fails", async () => {
    const { ctx } = fakeContext({});
    await expect(fetchSeriesSchedule("f1", NOW, ctx)).rejects.toBeInstanceOf(SourceFailure);
  });

  it("reads F2 Round pages listed on the season page; a failed page is a warning and the season is incomplete", async () => {
    const { ctx, requests } = fakeContext({
      "https://www.fiaformula2.com/en/racing/2026": "f2-season-2026.html",
      "https://www.fiaformula2.com/en/racing/2026/baku": "f2-round-baku-2026.html",
      "https://www.fiaformula2.com/en/racing/2026/lusail": "f2-round-lusail-2026.html",
      "https://www.fiaformula2.com/en/racing/2027": 500,
      "https://raw.githubusercontent.com/sportstimes/f1/main/_db/f2/2026.json": "sportstimes-f2-2026.json",
    });
    const schedule = await fetchSeriesSchedule("f2", NOW, ctx);
    expect(schedule).toMatchObject({ source: "fiaformula2", isFallback: false, completeSeasons: [] });
    expect(schedule.rounds.map((r) => r.round.id)).toEqual(["f2-2026-baku", "f2-2026-lusail"]);
    expect(schedule.warnings).toHaveLength(12);
    // Lusail is TBC on the official page; its Session times come from sportstimes.
    const lusail = schedule.rounds[1];
    expect(lusail.round.sessionTimesConfirmed).toBe(true);
    expect(lusail.sessions.map((s) => s.type)).toEqual(["practice", "qualifying", "sprint-race", "feature-race"]);
    expect(requests[0].userAgent).toContain("Mozilla/5.0");
  });

  it("falls back to sportstimes when the F2 season page fails", async () => {
    const { ctx } = fakeContext({
      "https://www.fiaformula2.com/en/racing/2026": 503,
      "https://raw.githubusercontent.com/sportstimes/f1/main/_db/f2/2026.json": "sportstimes-f2-2026.json",
    });
    const schedule = await fetchSeriesSchedule("f2", NOW, ctx);
    expect(schedule).toMatchObject({ source: "sportstimes", isFallback: true });
    expect(schedule.rounds).toHaveLength(4);
  });

  it.each(["fe", "indycar", "motogp"] as const)("reads %s from sportstimes; an unpublished next season is not an error", async (series) => {
    const { ctx, requests } = fakeContext({
      [`https://raw.githubusercontent.com/sportstimes/f1/main/_db/${series}/2026.json`]: `sportstimes-${series}-2026.json`,
    });
    const schedule = await fetchSeriesSchedule(series, NOW, ctx);
    expect(schedule).toMatchObject({ series, source: "sportstimes", isFallback: false, completeSeasons: [2026], problems: [] });
    expect(schedule.rounds.length).toBeGreaterThan(15);
    expect(requests.map((r) => r.url)).toEqual([
      `https://raw.githubusercontent.com/sportstimes/f1/main/_db/${series}/2026.json`,
      `https://raw.githubusercontent.com/sportstimes/f1/main/_db/${series}/2027.json`,
    ]);
    expect(requests.every((r) => r.userAgent === API_USER_AGENT)).toBe(true);
  });

  it("throws a SourceFailure for MotoGP when sportstimes is down (no fallback)", async () => {
    const { ctx } = fakeContext({ "https://raw.githubusercontent.com/sportstimes/f1/main/_db/motogp/2026.json": 503 });
    await expect(fetchSeriesSchedule("motogp", NOW, ctx)).rejects.toBeInstanceOf(SourceFailure);
  });

  it("reads WEC race pages for this season and next season's published Rounds", async () => {
    const { ctx } = fakeContext({
      "https://www.fiawec.com/en/season/2026": "wec-season-2026.html",
      "https://www.fiawec.com/en/race/6-hours-of-barcelona-2026": "wec-race-barcelona-2026.html",
      "https://www.fiawec.com/en/race/24-hours-of-le-mans-2026": "wec-race-le-mans-2026.html",
      "https://www.fiawec.com/en/race/qatar-1812km-2027": "wec-race-qatar-2027.html",
    });
    const schedule = await fetchSeriesSchedule("wec", NOW, ctx);
    expect(schedule.source).toBe("fiawec");
    expect(schedule.rounds.map((r) => r.round.id)).toEqual(["wec-2026-le-mans", "wec-2026-catalunya", "wec-2027-lusail"]);
    expect(schedule.completeSeasons).toEqual([]);
  });
});
