import { describe, expect, it } from "vitest";
import { isIdOfSeries, normaliseRounds, slugify } from "./normalise";
import { applyOverrides } from "./overrides";
import { localWithOffsetToIso, trackDate, trackMidnight } from "./time";
import type { RawRound } from "./types";

const raw = (over: Partial<RawRound>): RawRound => ({
  season: 2026,
  name: "Test Round",
  circuitHints: ["Monza"],
  timesConfirmed: true,
  sessions: [],
  sourceRef: "test",
  ...over,
});

describe("normaliseRounds", () => {
  it("flags and skips a Round at an unknown Circuit", () => {
    const { rounds, problems } = normaliseRounds("f1", [
      raw({ name: "Atlantis Grand Prix", circuitHints: ["Atlantis"], startDate: "2026-05-01", endDate: "2026-05-03" }),
    ]);
    expect(rounds).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Unknown Circuit");
    expect(problems[0]).toContain("Atlantis Grand Prix");
  });

  it("flags and skips a Session it can't map to a Session Type", () => {
    const { rounds, problems } = normaliseRounds("f2", [
      raw({
        sessions: [
          { key: "Practice", name: "Practice", type: "practice", startsAt: "2026-09-04T08:00:00Z", endsAt: null, cancelled: false },
          { key: "Parade", name: "Drivers' Parade", type: null, startsAt: "2026-09-06T10:00:00Z", endsAt: null, cancelled: false },
        ],
      }),
    ]);
    expect(rounds[0].sessions.map((s) => s.id)).toEqual(["f2-2026-monza:practice"]);
    expect(problems).toEqual([expect.stringContaining("Drivers' Parade")]);
  });

  it("estimates missing end times with the Series default and marks them", () => {
    const { rounds } = normaliseRounds("f1", [
      raw({
        sessions: [{ key: "Race", name: "Race", type: "race", startsAt: "2026-09-06T13:00:00Z", endsAt: null, cancelled: false }],
      }),
    ]);
    expect(rounds[0].sessions[0]).toMatchObject({ endsAt: "2026-09-06T15:00:00.000Z", endIsEstimated: true });
  });

  it("gives a second Round at the same Circuit in one season a distinct, stable id", () => {
    const s = (start: string) => [{ key: "Race", name: "Race", type: "race" as const, startsAt: start, endsAt: null, cancelled: false }];
    const { rounds } = normaliseRounds("f1", [
      raw({ name: "Second", sessions: s("2026-09-20T13:00:00Z") }),
      raw({ name: "First", sessions: s("2026-09-06T13:00:00Z") }),
    ]);
    expect(rounds.map((r) => [r.round.id, r.round.name])).toEqual([
      ["f1-2026-monza", "First"],
      ["f1-2026-monza-2", "Second"],
    ]);
  });

  it("gives repeated Session names distinct ids", () => {
    const s = { key: "Qualifying", name: "Qualifying", type: "qualifying" as const, endsAt: null, cancelled: false };
    const { rounds } = normaliseRounds("f3", [
      raw({ sessions: [{ ...s, startsAt: "2026-09-04T12:00:00Z" }, { ...s, startsAt: "2026-09-04T12:30:00Z" }] }),
    ]);
    expect(rounds[0].sessions.map((x) => x.id)).toEqual(["f3-2026-monza:qualifying", "f3-2026-monza:qualifying-2"]);
  });

  it("drops Sessions and keeps dates when times are TBC", () => {
    const { rounds } = normaliseRounds("f2", [
      raw({
        timesConfirmed: false,
        startDate: "2026-11-27",
        endDate: "2026-11-29",
        sessions: [{ key: "Practice", name: "Practice", type: "practice", startsAt: "2026-11-27T09:00:00Z", endsAt: null, cancelled: false }],
      }),
    ]);
    expect(rounds[0].sessions).toEqual([]);
    expect(rounds[0].round).toMatchObject({ sessionTimesConfirmed: false, startDate: "2026-11-27", endDate: "2026-11-29" });
  });
});

describe("time helpers", () => {
  it("converts local times with a GMT offset", () => {
    expect(localWithOffsetToIso("2026-09-24T10:00:00", "+04:00")).toBe("2026-09-24T06:00:00.000Z");
    expect(localWithOffsetToIso("2026-11-21T20:00:00", "-08:00")).toBe("2026-11-22T04:00:00.000Z");
  });

  it("computes Track Time dates and midnights across DST", () => {
    expect(trackDate("2026-11-22T04:00:00Z", "America/Los_Angeles")).toBe("2026-11-21");
    expect(trackMidnight("2026-10-25", "Europe/Madrid").toISOString()).toBe("2026-10-24T22:00:00.000Z"); // CEST
    expect(trackMidnight("2026-10-26", "Europe/Madrid").toISOString()).toBe("2026-10-25T23:00:00.000Z"); // CET
  });

  it("slugifies names", () => {
    expect(slugify("Qualifying - LMP2 & LMGT3")).toBe("qualifying-lmp2-and-lmgt3");
    expect(slugify("São Paulo")).toBe("sao-paulo");
  });
});

describe("applyOverrides", () => {
  const { rounds } = normaliseRounds("f1", [
    raw({
      sessions: [{ key: "Race", name: "Race", type: "race", startsAt: "2026-09-06T13:00:00Z", endsAt: "2026-09-06T15:00:00Z", cancelled: false }],
    }),
  ]);

  it("moves a Session keeping its length when only startsAt is given", () => {
    const result = applyOverrides(rounds, [{ sessionId: "f1-2026-monza:race", startsAt: "2026-09-06T14:00:00Z", reason: "t" }]);
    expect(result.rounds[0].sessions[0]).toMatchObject({ startsAt: "2026-09-06T14:00:00.000Z", endsAt: "2026-09-06T16:00:00.000Z" });
    expect([...result.overriddenSessionIds]).toEqual(["f1-2026-monza:race"]);
  });

  it("sets status and reports Overrides that match nothing", () => {
    const result = applyOverrides(rounds, [
      { sessionId: "f1-2026-monza:race", status: "cancelled", reason: "t" },
      { sessionId: "f1-2026-monza:sprint", status: "cancelled", reason: "t" },
    ]);
    expect(result.rounds[0].sessions[0].status).toBe("cancelled");
    expect(result.warnings).toEqual([expect.stringContaining("f1-2026-monza:sprint")]);
  });
});

describe("isIdOfSeries", () => {
  it("tells F1 ids from F1 Academy ids", () => {
    expect(isIdOfSeries("f1-2026-monaco:race", "f1")).toBe(true);
    expect(isIdOfSeries("f1-academy-2026-monaco:race-1", "f1")).toBe(false);
    expect(isIdOfSeries("f1-academy-2026-monaco:race-1", "f1-academy")).toBe(true);
    expect(isIdOfSeries("f2-2026-baku:feature-race", "f1")).toBe(false);
  });
});
