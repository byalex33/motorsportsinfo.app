// GT World Challenge Europe's calendar and event pages. Fixtures are trimmed to the event lists and timetables.
import { describe, expect, it } from "vitest";
import { normaliseRounds } from "../normalise";
import { fixture } from "../test-utils";
import { gtwcStart, gtwcSessionType, parseGtwcCalendar, parseGtwcEventPage, parseGtwcTitleDates } from "./gtwc";

const calendar = parseGtwcCalendar(fixture("gtwc-calendar-2026.html"));
const event = (path: string) => calendar.find((e) => e.path === path)!;

function round(path: string, page: string) {
  const { rounds, problems } = normaliseRounds("gtwc-europe", [parseGtwcEventPage(fixture(page), event(path), path)]);
  expect(problems).toEqual([]);
  return rounds[0];
}

const minutes = (s: { startsAt: string; endsAt: string }) => (Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 60000;

describe("GT World Challenge Europe calendar", () => {
  it("lists the ten Rounds with their numbers, not the test days", () => {
    expect(calendar.map((e) => [e.roundNumber, e.name])).toEqual([
      [1, "Circuit Paul Ricard"],
      [2, "Brands Hatch"],
      [3, "Monza"],
      [4, "CrowdStrike 24 Hours of Spa"],
      [5, "Misano"],
      [6, "Magny-Cours"],
      [7, "Nürburgring"],
      [8, "Zandvoort"],
      [9, "Barcelona"],
      [10, "Portimao"],
    ]);
    expect(calendar.every((e) => e.season === 2026)).toBe(true);
    expect(event("/event/255/portimao")).toBeDefined(); // the upcoming Round, listed in its own block
  });
});

describe("GT World Challenge Europe event pages", () => {
  it("reads a Sprint Cup weekend: the qualifying groups, two races, no test session", () => {
    const r = round("/event/254/barcelona", "gtwc-event-barcelona-2026.html");
    expect(r.round).toMatchObject({ id: "gtwc-europe-2026-catalunya", name: "Barcelona", startDate: "2026-10-02", endDate: "2026-10-04" });
    expect(r.sessions.map((s) => [s.name, s.type, s.startsAt, minutes(s)])).toEqual([
      ["Free Practice 1", "practice", "2026-10-02T07:00:00.000Z", 60],
      ["Free Practice 2", "practice", "2026-10-02T11:55:00.000Z", 60],
      ["Qualifying 1 - Group A", "qualifying", "2026-10-03T07:50:00.000Z", 15],
      ["Qualifying 1 - Group B", "qualifying", "2026-10-03T08:05:00.000Z", 15],
      ["Race 1", "race", "2026-10-03T12:00:00.000Z", 60],
      ["Race 2", "race", "2026-10-04T16:20:00.000Z", 60],
    ]);
    expect(r.sessions.every((s) => s.endIsEstimated)).toBe(true);
  });

  it("reads an Endurance Cup weekend: three-hour Main Race, Bronze test dropped", () => {
    const r = round("/event/255/portimao", "gtwc-event-portimao-2026.html");
    expect(r.round).toMatchObject({ id: "gtwc-europe-2026-portimao", startDate: "2026-10-16", endDate: "2026-10-17" });
    expect(r.sessions.map((s) => [s.name, s.startsAt, minutes(s)])).toEqual([
      ["Free Practice 1", "2026-10-16T07:45:00.000Z", 60],
      ["Qualifying", "2026-10-16T16:55:00.000Z", 70],
      ["Main Race", "2026-10-17T16:00:00.000Z", 180],
    ]);
  });

  it("names the 24 Hours without its sponsor and runs its race for 24 hours", () => {
    const r = round("/event/249/crowdstrike-24-hours-of-spa", "gtwc-event-spa-2026.html");
    expect(r.round).toMatchObject({ id: "gtwc-europe-2026-spa-francorchamps", name: "24 Hours of Spa" });
    expect(r.sessions.some((s) => /parade|pit walk|test|combined/i.test(s.name))).toBe(false);
    expect(r.sessions.find((s) => s.name === "Superpole")?.type).toBe("qualifying");
    const race = r.sessions.at(-1)!;
    expect([race.name, race.startsAt, minutes(race)]).toEqual(["Main Race", "2026-06-27T14:30:00.000Z", 1440]);
  });

  it("drops classification checkpoints listed as timetable rows", () => {
    const html = `<table class="timetable__table"><caption>Saturday, 30 May</caption><tbody>
      <tr><td>Qualifying 1 Combined</td><td>11:00</td><td>09:00</td></tr>
      <tr><td>Main Race</td><td>15:00</td><td>13:00</td></tr>
      <tr><td>Main Race after 1h 30</td><td>16:30</td><td>14:30</td></tr></tbody></table>`;
    const raw = parseGtwcEventPage(html, { path: "/event/248/monza", season: 2026, roundNumber: 3, name: "Monza" }, "x");
    expect(raw.sessions.map((s) => [s.name, s.startsAt])).toEqual([["Main Race", "2026-05-30T13:00:00.000Z"]]);
  });

  it("lists an event page without a timetable as Times TBC on the title's dates", () => {
    const html = `<title>Circuit Paul Ricard, France, 16 - 18 April 2027 | GT World Challenge Europe</title>`;
    const raw = parseGtwcEventPage(html, { path: "/event/260/circuit-paul-ricard", season: 2027, roundNumber: 1, name: "Circuit Paul Ricard" }, "x");
    const { rounds } = normaliseRounds("gtwc-europe", [raw]);
    expect(rounds[0].round).toMatchObject({
      id: "gtwc-europe-2027-paul-ricard",
      sessionTimesConfirmed: false,
      startDate: "2027-04-16",
      endDate: "2027-04-18",
    });
  });
});

describe("GTWC helpers", () => {
  it("parses title dates, across a month end too", () => {
    expect(parseGtwcTitleDates("Barcelona, Spain, 1 - 4 October 2026 | GT World")).toEqual({ startDate: "2026-10-01", endDate: "2026-10-04" });
    expect(parseGtwcTitleDates("Magny-Cours, France, 30 July - 1 August 2027")).toEqual({ startDate: "2027-07-30", endDate: "2027-08-01" });
  });

  it("takes the offset from the local and GMT columns, past local midnight too", () => {
    expect(gtwcStart("Friday, 2 October", "09:00", "07:00", 2026)).toBe("2026-10-02T07:00:00.000Z");
    expect(gtwcStart("Sunday, 28 June", "00:30", "22:30", 2026)).toBe("2026-06-27T22:30:00.000Z");
  });

  it.each([
    ["Free Practice 1", "practice"],
    ["Night Practice", "practice"],
    ["Warm-up", "practice"],
    ["Qualifying 1 - Group A", "qualifying"],
    ["Superpole", "qualifying"],
    ["Main Race", "race"],
    ["Race 2", "race"],
    ["Something Else", null],
  ])("%s → %s", (name, type) => {
    expect(gtwcSessionType(name)).toBe(type);
  });
});
