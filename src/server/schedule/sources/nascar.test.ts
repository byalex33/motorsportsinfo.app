// NASCAR's schedule feed. The fixture is the 2026 Cup Series list, trimmed to the fields the parser reads.
import { describe, expect, it } from "vitest";
import { normaliseRounds } from "../normalise";
import { fixtureJson } from "../test-utils";
import { cleanNascarRaceName, parseNascarSeason, type NascarRace, type NascarSeason } from "./nascar";

const load = () => fixtureJson<NascarSeason>("nascar-2026.json");

function normalise(data: NascarSeason = load()) {
  const parsed = parseNascarSeason(data, 2026);
  return { ...normaliseRounds("nascar", parsed.rounds), warnings: parsed.warnings };
}

const minutes = (s: { startsAt: string; endsAt: string }) => (Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 60000;

describe("NASCAR Cup Series 2026", () => {
  const { rounds, problems, warnings } = normalise();
  const byId = Object.fromEntries(rounds.map((r) => [r.round.id, r]));

  it("makes a Round of every race but the Duels, each at a known Circuit", () => {
    expect(problems).toEqual([]);
    expect(warnings).toEqual([]);
    expect(rounds).toHaveLength(38);
    expect(rounds[0].round).toMatchObject({ id: "nascar-2026-bowman-gray", name: "Cook Out Clash at Bowman Gray" });
    expect(rounds.at(-1)!.round).toMatchObject({ id: "nascar-2026-homestead", name: "NASCAR Championship Race" });
  });

  it("keeps practice, qualifying and the race, and drops off-track items", () => {
    expect(byId["nascar-2026-cota"].sessions.map((s) => [s.id, s.type, s.startsAt, minutes(s)])).toEqual([
      ["nascar-2026-cota:practice", "practice", "2026-02-28T15:00:00.000Z", 50],
      ["nascar-2026-cota:qualifying", "qualifying", "2026-02-28T16:10:00.000Z", 60],
      ["nascar-2026-cota:race", "race", "2026-03-01T20:30:00.000Z", 180],
    ]);
    expect(byId["nascar-2026-cota"].round.name).toBe("DuraMAX Texas Grand Prix");
  });

  it("folds the Duels into the Daytona 500 as qualifying", () => {
    const daytona = byId["nascar-2026-daytona"];
    expect(daytona.round).toMatchObject({ name: "DAYTONA 500", startDate: "2026-02-11", endDate: "2026-02-15" });
    expect(daytona.sessions.filter((s) => s.type === "qualifying").map((s) => [s.name, minutes(s)])).toEqual([
      ["Qualifying", 60],
      ["Duel 1", 75],
      ["Duel 2", 75],
    ]);
    expect(minutes(daytona.sessions.at(-1)!)).toBe(210);
  });

  it("numbers a second visit to a track", () => {
    expect(byId["nascar-2026-charlotte"].round.name).toBe("Coca-Cola 600");
    expect(minutes(byId["nascar-2026-charlotte"].sessions.at(-1)!)).toBe(270);
    expect(byId["nascar-2026-charlotte-2"].round.name).toBe("Bank of America 400");
  });

  it("lists a race without a weekend schedule as Times TBC on its date", () => {
    const data = load();
    const races = data.series_1!.map((r): NascarRace => (r.race_id === 5601 ? { ...r, schedule: [] } : r));
    const homestead = normalise({ series_1: races }).rounds.find((r) => r.round.id === "nascar-2026-homestead")!;
    expect(homestead.round).toMatchObject({ sessionTimesConfirmed: false, startDate: "2026-11-08", endDate: "2026-11-08" });
    expect(homestead.sessions).toEqual([]);
  });
});

describe("cleanNascarRaceName", () => {
  it.each([
    ["Pennzoil 400 presented by Jiffy Lube", "Pennzoil 400"],
    ["Iowa Corn 350 Powered by Ethanol", "Iowa Corn 350"],
    ["Quaker State 400 Available at Walmart", "Quaker State 400"],
    ["Hollywood Casino 400 ", "Hollywood Casino 400"],
  ])("%s → %s", (input, expected) => {
    expect(cleanNascarRaceName(input)).toBe(expected);
  });
});
