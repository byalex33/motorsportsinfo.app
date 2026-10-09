import { describe, expect, it } from "vitest";
import { featuredUntil, roundOpensAt, selectCalendarSessions, selectFeaturedRound, selectUpcomingSessions } from "./select";
import { makeRound, makeSession, withContext } from "./test-utils";

// Singapore (UTC+8): Fri 9 – Sun 11 Oct 2026, Race 12:00–14:00 UTC on Sunday.
const sgRound = makeRound("f1-2026-marina-bay", "marina-bay", "2026-10-09", "2026-10-11");
const sg = withContext(sgRound, [
  makeSession(sgRound.id, "practice-1", "2026-10-09T08:30:00Z"),
  makeSession(sgRound.id, "race", "2026-10-11T12:00:00Z", { type: "race", endsAt: "2026-10-11T14:00:00.000Z" }),
]);
const usRound = makeRound("f1-2026-cota", "cota", "2026-10-23", "2026-10-25");
const us = withContext(usRound, [
  makeSession(usRound.id, "practice-1", "2026-10-23T17:30:00Z"),
  makeSession(usRound.id, "race", "2026-10-25T20:00:00Z", { type: "race", endsAt: "2026-10-25T22:00:00.000Z" }),
]);
const next2027Round = makeRound("f1-2027-sakhir", "sakhir", "2027-03-12", "2027-03-14", { sessionTimesConfirmed: false });
const next2027 = withContext(next2027Round, []);

describe("round windows", () => {
  it("opens at 00:00 Track Time on the first day", () => {
    expect(roundOpensAt(sg).toISOString()).toBe("2026-10-08T16:00:00.000Z");
  });
  it("stays featured until 2 h after the final Session ends", () => {
    expect(featuredUntil(sg).toISOString()).toBe("2026-10-11T16:00:00.000Z");
  });
  it("uses the end of the last day for a Round without Session times", () => {
    // Bahrain is UTC+3: 15 Mar 00:00 local = 14 Mar 21:00 UTC, plus 2 h grace.
    expect(featuredUntil(next2027).toISOString()).toBe("2027-03-14T23:00:00.000Z");
  });
});

describe("selectFeaturedRound", () => {
  const all = [us, next2027, sg];

  it("features the next upcoming Round before any is in progress", () => {
    const r = selectFeaturedRound(all, new Date("2026-10-05T00:00:00Z"));
    expect(r.kind === "round" && r.round.id).toBe("f1-2026-marina-bay");
  });

  it("features the Round in progress", () => {
    const r = selectFeaturedRound(all, new Date("2026-10-10T00:00:00Z"));
    expect(r.kind === "round" && r.round.id).toBe("f1-2026-marina-bay");
  });

  it("holds the Round for 2 h after its final Session, then moves on", () => {
    expect(selectFeaturedRound(all, new Date("2026-10-11T15:59:00Z"))).toMatchObject({ round: { id: sgRound.id } });
    expect(selectFeaturedRound(all, new Date("2026-10-11T16:00:00Z"))).toMatchObject({ round: { id: usRound.id } });
  });

  it("returns next season's first Round (Times TBC) once this season is over", () => {
    const r = selectFeaturedRound(all, new Date("2026-12-20T00:00:00Z"));
    expect(r).toMatchObject({ kind: "round", round: { id: "f1-2027-sakhir", sessionTimesConfirmed: false }, sessions: [] });
  });

  it("returns season-complete when nothing remains and next season is unknown", () => {
    expect(selectFeaturedRound([sg, us], new Date("2026-12-20T00:00:00Z"))).toEqual({ kind: "season-complete", season: 2026 });
    expect(selectFeaturedRound([], new Date("2026-12-20T00:00:00Z"))).toEqual({ kind: "season-complete", season: 2026 });
  });

  it("includes cancelled Sessions, ordered by start", () => {
    const round = makeRound("f2-2026-baku", "baku", "2026-09-24", "2026-09-26");
    const r = withContext(round, [
      makeSession(round.id, "feature-race", "2026-09-26T07:00:00Z", { status: "cancelled" }),
      makeSession(round.id, "practice", "2026-09-24T06:00:00Z"),
    ]);
    const result = selectFeaturedRound([r], new Date("2026-09-20T00:00:00Z"));
    expect(result.kind === "round" && result.sessions.map((s) => [s.id, s.status])).toEqual([
      ["f2-2026-baku:practice", "scheduled"],
      ["f2-2026-baku:feature-race", "cancelled"],
    ]);
  });

  it("skips a Round whose every Session is cancelled", () => {
    const round = makeRound("f1-2026-jeddah", "jeddah", "2026-10-16", "2026-10-18");
    const cancelled = withContext(round, [makeSession(round.id, "race", "2026-10-18T17:00:00Z", { status: "cancelled" })]);
    const r = selectFeaturedRound([cancelled, us], new Date("2026-10-17T00:00:00Z"));
    expect(r.kind === "round" && r.round.id).toBe(usRound.id);
  });
});

describe("selectUpcomingSessions", () => {
  it("lists all Sessions of unfinished Rounds across Series, ordered by start", () => {
    const wecRound = makeRound("wec-2026-catalunya", "catalunya", "2026-10-16", "2026-10-18");
    const wec = withContext(wecRound, [makeSession(wecRound.id, "race", "2026-10-18T10:00:00Z", { status: "cancelled" })]);
    const list = selectUpcomingSessions([us, wec, sg], new Date("2026-10-11T13:00:00Z"));
    expect(list.map((x) => x.session.id)).toEqual([
      "f1-2026-marina-bay:practice-1",
      "f1-2026-marina-bay:race",
      "wec-2026-catalunya:race",
      "f1-2026-cota:practice-1",
      "f1-2026-cota:race",
    ]);
    expect(list[2].circuit.id).toBe("catalunya");
    expect(list[2].round.id).toBe("wec-2026-catalunya");
  });
});

describe("selectCalendarSessions", () => {
  it("keeps Rounds that finished within 60 days so calendar apps don't delete their events", () => {
    // Singapore's Race ends 2026-10-11T14:00Z.
    const ids = (now: string) => selectCalendarSessions([sg, us], new Date(now)).map((x) => x.round.id);
    expect(ids("2026-11-20T00:00:00Z")).toContain("f1-2026-marina-bay");
    expect(selectUpcomingSessions([sg, us], new Date("2026-11-20T00:00:00Z")).map((x) => x.round.id)).not.toContain(
      "f1-2026-marina-bay",
    );
    expect(ids("2026-12-20T00:00:00Z")).not.toContain("f1-2026-marina-bay");
  });
});
