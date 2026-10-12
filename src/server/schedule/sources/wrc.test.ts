// wrc.com's content API. Fixtures: the 2026 season list (trimmed), Chile's itinerary response in full, and
// other rallies' itinerary blocks, chosen for their loosely typed day headings and stage labels.
import { describe, expect, it } from "vitest";
import { normaliseRounds } from "../normalise";
import { fixtureJson } from "../test-utils";
import { itinerarySlug, parseUtcOffset, parseWrcRally, wrcRoundName, type WrcEvent } from "./wrc";

const season = fixtureJson<{ data: WrcEvent[] }>("wrc-season-2026.json").data;
const event = (slug: string) => season.find((e) => e.reference.uriSlug === slug)!;

function rally(slug: string, itinerary: string | null) {
  const warnings: string[] = [];
  const raw = parseWrcRally(event(slug), itinerary ? fixtureJson(`wrc-itinerary-${itinerary}.json`) : null, 2026, warnings);
  const { rounds, problems } = normaliseRounds("wrc", [raw]);
  return { ...rounds[0], problems, warnings };
}

const summary = (sessions: { name: string; type: string; startsAt: string; endsAt: string; endIsEstimated: boolean }[]) =>
  sessions.map((s) => [s.name, s.type, s.startsAt.slice(0, 16), s.endsAt.slice(0, 16)]);

describe("WRC rallies", () => {
  it("turns an itinerary into Shakedown, one Session per day and the Power Stage, in UTC", () => {
    const chile = rally("wrc-rally-chile-bio-bio-2026", "chile-2026");
    expect(chile.problems).toEqual([]);
    expect(chile.round).toMatchObject({
      id: "wrc-2026-concepcion",
      name: "Rally Chile Biobío",
      circuitId: "concepcion",
      startDate: "2026-09-10",
      endDate: "2026-09-13",
      sessionTimesConfirmed: true,
    });
    // All Times UTC -3. A day ends 75 minutes after its last stage starts.
    expect(summary(chile.sessions)).toEqual([
      ["Shakedown", "shakedown", "2026-09-10T14:00", "2026-09-10T17:00"],
      ["Day 1 (SS1–SS6)", "stages", "2026-09-11T11:53", "2026-09-11T21:07"],
      ["Day 2 (SS7–SS12)", "stages", "2026-09-12T12:08", "2026-09-12T21:20"],
      ["Day 3 (SS13–SS15)", "stages", "2026-09-13T12:00", "2026-09-13T15:28"],
      ["Power Stage (SS16)", "power-stage", "2026-09-13T16:15", "2026-09-13T17:00"],
    ]);
    expect(chile.sessions.map((s) => s.id)).toEqual([
      "wrc-2026-concepcion:shakedown",
      "wrc-2026-concepcion:day-1",
      "wrc-2026-concepcion:day-2",
      "wrc-2026-concepcion:day-3",
      "wrc-2026-concepcion:power-stage",
    ]);
    expect(chile.sessions.every((s) => s.endIsEstimated)).toBe(true);
  });

  it("dates days by weekday, whatever the heading says", () => {
    // "Saturday, April 202611" (Croatia) and "Sunday, 18 July" for 19 July (Estonia).
    expect(summary(rally("wrc-croatia-rally-2026", "croatia-2026").sessions)[2]).toEqual([
      "Day 2 (SS9–SS16)",
      "stages",
      "2026-04-11T06:43",
      "2026-04-11T16:37",
    ]);
    const estonia = rally("wrc-delfi-rally-estonia-2026", "estonia-2026");
    expect(summary(estonia.sessions).slice(-2)).toEqual([
      ["Day 3 (SS17)", "stages", "2026-07-19T08:05", "2026-07-19T09:20"],
      ["Power Stage (SS18)", "power-stage", "2026-07-19T10:15", "2026-07-19T11:00"],
    ]);
  });

  it("counts a Thursday-evening stage as a day, and reads 'SS 23' and 'Wednesday, 06.05.'", () => {
    const portugal = rally("wrc-vodafone-rally-de-portugal-2026", "portugal-2026");
    expect(portugal.sessions.map((s) => s.name)).toEqual([
      "Shakedown",
      "Day 1 (SS1–SS3)",
      "Day 2 (SS4–SS10)",
      "Day 3 (SS11–SS19)",
      "Day 4 (SS20–SS22)",
      "Power Stage (SS23)",
    ]);
    expect(portugal.sessions[0].startsAt).toBe("2026-05-06T14:01:00.000Z");
  });

  it("skips an entry without a time, with a warning, and uses the rally's own offset when the title has none", () => {
    const paraguay = rally("wrc-rally-del-paraguay-2026", "paraguay-2026");
    expect(paraguay.warnings).toEqual([expect.stringContaining('no time for "Shakedown - Carmen del Paraná')]);
    expect(paraguay.sessions[0]).toMatchObject({ name: "Day 1 (SS1–SS8)", startsAt: "2026-08-28T12:03:00.000Z" });
  });

  it("is Times TBC on the rally's dates until the itinerary is published", () => {
    const sardegna = rally("wrc-rally-italia-sardegna-2026", "not-published");
    expect(sardegna.round).toMatchObject({ circuitId: "alghero", sessionTimesConfirmed: false, startDate: "2026-10-01", endDate: "2026-10-04" });
    expect(sardegna.sessions).toEqual([]);
  });

  it("flags a rally whose service park isn't known", () => {
    const warnings: string[] = [];
    const raw = parseWrcRally({ ...event("wrc-rally-chile-bio-bio-2026"), content: { title: "WRC Rally US 2027" } }, null, 2027, warnings);
    expect(normaliseRounds("wrc", [raw]).problems).toEqual([expect.stringContaining('Unknown Circuit for WRC 2027 "Rally US"')]);
  });

  it("knows the service park of every 2026 rally", () => {
    const warnings: string[] = [];
    const { problems, rounds } = normaliseRounds("wrc", season.map((e) => parseWrcRally(e, null, 2026, warnings)));
    expect(problems).toEqual([]);
    expect(rounds).toHaveLength(13);
  });
});

describe("helpers", () => {
  it.each([
    ["Itinerary Version 1.0.2., All Times UTC -3", -180],
    ["(Version 2.0) All times UTC+9", 540],
    ["(Version 1.0) All Times UTC +2", 120],
    ["Itinerary", null],
  ])("parseUtcOffset(%s) = %s", (title, offset) => {
    expect(parseUtcOffset(title)).toBe(offset);
  });

  it("names Rounds without the WRC prefix and the year", () => {
    expect(wrcRoundName("WRC Rally Islas Canarias - Rally of Spain 2026")).toBe("Rally Islas Canarias - Rally of Spain");
  });

  it("finds the Itinerary tab, but not once it points at the results", () => {
    expect(itinerarySlug(fixtureJson("wrc-tabs-chile-2026.json"))).toBe("itinerary-stages-wrc-rally-chile-bio-bio");
    expect(itinerarySlug({ data: { tabs: [{ label: "Itinerary", url: "/en/events/x/wrc-rally-sweden-2026-results" }] } })).toBeNull();
  });
});
