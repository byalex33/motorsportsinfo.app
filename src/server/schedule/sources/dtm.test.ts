// DTM's content API. Fixtures are trimmed to the fields the parser reads.
import { describe, expect, it } from "vitest";
import { normaliseRounds } from "../normalise";
import { fixtureJson } from "../test-utils";
import { dtmSeasonEvents, dtmSessionName, dtmSessionType, parseDtmEvent, type DtmEvent, type DtmEventDetails } from "./dtm";

const events = fixtureJson<{ events: DtmEvent[] }>("dtm-events.json").events;
const details = (name: string) => fixtureJson<DtmEventDetails>(name).events[0];

describe("DTM events", () => {
  it("lists each season's eight Rounds in order, matched to known Circuits", () => {
    const raws = [2026, 2027].flatMap((season) => dtmSeasonEvents(events, season).map((e) => parseDtmEvent(e, [], season, e.slug)));
    const { rounds, problems } = normaliseRounds("dtm", raws);
    expect(problems).toEqual([]);
    expect(rounds.filter((r) => r.round.season === 2026).map((r) => r.round.id)).toEqual([
      "dtm-2026-red-bull-ring",
      "dtm-2026-zandvoort",
      "dtm-2026-lausitzring",
      "dtm-2026-norisring",
      "dtm-2026-oschersleben",
      "dtm-2026-nurburgring",
      "dtm-2026-sachsenring",
      "dtm-2026-hockenheim",
    ]);
    expect(rounds.filter((r) => r.round.season === 2027)).toHaveLength(8);
    // Dates in Track Time: the event starts at local midnight (22:00 UTC the day before).
    expect(rounds[0].round).toMatchObject({ name: "Red Bull Ring", startDate: "2026-04-24", endDate: "2026-04-26" });
  });

  it("keeps only DTM's own Sessions, with their end times", () => {
    const hockenheim = details("dtm-event-hockenheim-2026.json");
    const { rounds, problems } = normaliseRounds("dtm", [parseDtmEvent(hockenheim, hockenheim.timetable ?? [], 2026, "x")]);
    expect(problems).toEqual([]);
    expect(rounds[0].sessions.map((s) => [s.name, s.type, s.startsAt, s.endsAt, s.endIsEstimated])).toEqual([
      ["Free Practice 1", "practice", "2026-10-09T10:05:00.000Z", "2026-10-09T11:00:00.000Z", false],
      ["Free Practice 2", "practice", "2026-10-09T13:30:00.000Z", "2026-10-09T14:15:00.000Z", false],
      ["Qualifying 1", "qualifying", "2026-10-10T07:35:00.000Z", "2026-10-10T07:55:00.000Z", false],
      ["Race 1", "race", "2026-10-10T11:30:00.000Z", "2026-10-10T12:30:00.000Z", false],
      ["Qualifying 2", "qualifying", "2026-10-11T07:30:00.000Z", "2026-10-11T07:50:00.000Z", false],
      ["Race 2", "race", "2026-10-11T14:30:00.000Z", "2026-10-11T15:30:00.000Z", false],
    ]);
  });

  it("lists a Round without a timetable as Times TBC", () => {
    const rbr = details("dtm-event-red-bull-ring-2027.json");
    const { rounds } = normaliseRounds("dtm", [parseDtmEvent(rbr, rbr.timetable ?? [], 2027, "x")]);
    expect(rounds[0].round).toMatchObject({
      id: "dtm-2027-red-bull-ring",
      sessionTimesConfirmed: false,
      startDate: "2027-04-23",
      endDate: "2027-04-25",
    });
  });

  it("tidies the timetable's spelling and capitals", () => {
    expect(dtmSessionName("Free practice 3")).toBe("Free Practice 3");
    expect(dtmSessionName("Qualiyfing 2")).toBe("Qualifying 2");
    expect(dtmSessionName("Qualifying 1 Group A")).toBe("Qualifying 1 Group A");
  });

  it.each([
    ["Free Practice 1", "practice"],
    ["Qualifying 2", "qualifying"],
    ["Race 1", "race"],
    ["Track-Safari", null],
  ])("%s → %s", (label, type) => {
    expect(dtmSessionType(label)).toBe(type);
  });
});
