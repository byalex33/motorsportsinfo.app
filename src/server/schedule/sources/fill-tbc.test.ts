import { describe, expect, it } from "vitest";
import { normaliseRounds } from "../normalise";
import { fixture, fixtureJson } from "../test-utils";
import { parseFiaRoundPage } from "./fia-feeder";
import { fillTbcRounds } from "./fill-tbc";
import { parseSportstimes, type SportstimesRace } from "./sportstimes";

const lusail = () =>
  parseFiaRoundPage(fixture("f2-round-lusail-2026.html"), {
    season: 2026,
    slug: "lusail",
    roundNumber: 13,
    url: "https://www.fiaformula2.com/en/racing/2026/lusail",
  });

const sportstimesF2 = () => parseSportstimes(fixtureJson<{ races: SportstimesRace[] }>("sportstimes-f2-2026.json"), 2026, "f2").rounds;

describe("fillTbcRounds", () => {
  it("fills an official TBC Round with sportstimes Session times, keeping the official Round", () => {
    const official = lusail();
    expect(official.timesConfirmed).toBe(false);

    const { rounds, filled } = fillTbcRounds([official], sportstimesF2());
    expect(filled).toHaveLength(1);

    const { rounds: normalised, problems } = normaliseRounds("f2", rounds);
    expect(problems).toEqual([]);
    expect(normalised[0].round).toMatchObject({ id: "f2-2026-lusail", name: "Round 13", sessionTimesConfirmed: true });
    expect(normalised[0].sessions.map((s) => [s.id, s.type, s.startsAt])).toEqual([
      ["f2-2026-lusail:practice", "practice", "2026-11-27T09:00:00.000Z"],
      ["f2-2026-lusail:qualifying", "qualifying", "2026-11-27T13:00:00.000Z"],
      ["f2-2026-lusail:sprint-race", "sprint-race", "2026-11-28T10:00:00.000Z"],
      ["f2-2026-lusail:feature-race", "feature-race", "2026-11-29T09:00:00.000Z"],
    ]);
  });

  it("leaves confirmed Rounds and unmatched TBC Rounds alone", () => {
    const official = { ...lusail(), startDate: "2026-12-11", endDate: "2026-12-13" };
    const { rounds, filled } = fillTbcRounds([official], sportstimesF2());
    expect(filled).toEqual([]);
    expect(rounds[0]).toBe(official);
  });
});
