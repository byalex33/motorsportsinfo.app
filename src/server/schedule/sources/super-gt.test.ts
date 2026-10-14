// Super GT's calendar and race pages (Japanese). Fixtures are trimmed to the season table and the timetables.
import { describe, expect, it } from "vitest";
import { normaliseRounds } from "../normalise";
import { fixture } from "../test-utils";
import { parseSuperGtCalendar, parseSuperGtRacePage, superGtSession } from "./super-gt";

const calendar = parseSuperGtCalendar(fixture("super-gt-calendar-2026.html"), 2026);
const pages: Record<number, string> = {
  1: "super-gt-race-okayama-2026.html",
  7: "super-gt-race-autopolis-2026.html",
  8: "super-gt-race-motegi-r8-2026.html",
};

function season() {
  return normaliseRounds(
    "super-gt",
    calendar.map((link) => parseSuperGtRacePage(pages[link.roundNumber] ? fixture(pages[link.roundNumber]) : "", link, 2026)),
  );
}

const minutes = (s: { startsAt: string; endsAt: string }) => (Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 60000;

describe("Super GT 2026", () => {
  const { rounds, problems } = season();
  const byName = Object.fromEntries(rounds.map((r) => [r.round.name, r]));

  it("lists every Round by its official number, at a known Circuit", () => {
    expect(problems).toEqual([]);
    expect(rounds.map((r) => [r.round.name, r.round.id])).toEqual([
      ["Round 1", "super-gt-2026-okayama"],
      ["Round 2", "super-gt-2026-fuji"],
      ["Round 4", "super-gt-2026-fuji-2"],
      ["Round 5", "super-gt-2026-suzuka"],
      ["Round 6", "super-gt-2026-sugo"],
      ["Round 7", "super-gt-2026-autopolis"],
      // Round 3 moved to Motegi in November, the same weekend as Round 8.
      ["Round 3", "super-gt-2026-motegi"],
      ["Round 8", "super-gt-2026-motegi-2"],
    ]);
  });

  it("reads the timetable in JST, keeping only Super GT's Sessions", () => {
    const r = byName["Round 7"];
    expect(r.round).toMatchObject({ startDate: "2026-10-17", endDate: "2026-10-18", sessionTimesConfirmed: true });
    expect(r.sessions.map((s) => [s.name, s.type, s.startsAt, minutes(s), s.endIsEstimated])).toEqual([
      ["Practice", "practice", "2026-10-17T01:30:00.000Z", 95, false],
      ["Qualifying 1", "qualifying", "2026-10-17T05:30:00.000Z", 43, false],
      ["Qualifying 2", "qualifying", "2026-10-17T06:23:00.000Z", 28, false],
      ["Warm-up", "practice", "2026-10-18T02:40:00.000Z", 20, false],
      ["Race", "race", "2026-10-18T04:10:00.000Z", 180, false],
    ]);
  });

  it("estimates the end of a race listed by laps", () => {
    const race = byName["Round 1"].sessions.at(-1)!;
    expect([race.name, race.startsAt, minutes(race), race.endIsEstimated]).toEqual(["Race", "2026-04-12T04:20:00.000Z", 120, true]);
  });

  it("lists a Round whose timetable isn't out as Times TBC on its calendar dates", () => {
    expect(byName["Round 8"].round).toMatchObject({ sessionTimesConfirmed: false, startDate: "2026-11-06", endDate: "2026-11-08" });
    expect(byName["Round 8"].sessions).toEqual([]);
  });
});

describe("superGtSession", () => {
  it.each([
    ["公式練習", "Practice", "practice"],
    ["公式予選（Q1）", "Qualifying 1", "qualifying"],
    ["ウォームアップ走行", "Warm-up", "practice"],
    ["決勝レース（3時間）", "Race", "race"],
    ["決勝レース（82Laps）", "Race", "race"],
  ])("%s → %s", (label, name, type) => {
    expect(superGtSession(label)).toEqual({ name, type });
  });

  it("drops fan programme items and flags anything unknown", () => {
    expect(superGtSession("サーキットサファリ")).toBeNull();
    expect(superGtSession("何か")).toEqual({ name: "何か", type: null });
  });
});
