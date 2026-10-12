// IMSA's calendar feed. The sample is hand-written iCalendar in the shape ECAL serves (no real feed saved yet):
// it checks the iCalendar reading and the grouping into Rounds, not IMSA's exact wording.
import { describe, expect, it } from "vitest";
import { normaliseRounds } from "../normalise";
import { imsaSessionType, parseIcs, parseIcsDate, parseImsaCalendar } from "./imsa";

const SAMPLE = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:1",
  "SUMMARY:Practice 1",
  "LOCATION:Michelin Raceway Road Atlanta\\, Braselton\\, GA",
  "DTSTART;TZID=America/New_York:20261001T101500",
  "DTEND;TZID=America/New_York:20261001T114500",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:2",
  "SUMMARY:Qualifying",
  "LOCATION:Michelin Raceway Road Atlanta\\, Braselton\\, GA",
  "DTSTART:20261002T190500Z",
  "DTEND:20261002T203000Z",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:3",
  "SUMMARY:Motul Petit Le Mans",
  "LOCATION:Michelin Raceway Road Atlanta\\, Braselton\\, GA",
  "DTSTART:20261003T161000Z",
  "DTEND:20261004T021000Z",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:4",
  "SUMMARY:Roar Before the Rolex 24",
  "LOCATION:Daytona International Speedway",
  "DTSTART;VALUE=DATE:20270115",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseIcsDate", () => {
  it("reads UTC, zoned and all-day values", () => {
    expect(parseIcsDate("", "20261002T190500Z")).toBe("2026-10-02T19:05:00.000Z");
    // 10:15 in New York in October is EDT, UTC-4.
    expect(parseIcsDate(";TZID=America/New_York", "20261001T101500")).toBe("2026-10-01T14:15:00.000Z");
    expect(parseIcsDate(";VALUE=DATE", "20270115")).toBeNull();
  });
});

describe("parseIcs", () => {
  it("unescapes text and skips events without a start time", () => {
    const events = parseIcs(SAMPLE);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ summary: "Practice 1", location: "Michelin Raceway Road Atlanta, Braselton, GA" });
  });
});

describe("parseImsaCalendar", () => {
  it("groups a weekend's events into one Round at its Circuit", () => {
    const { rounds, problems } = normaliseRounds("imsa", parseImsaCalendar(SAMPLE, 2026).rounds);
    expect(problems).toEqual([]);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].round).toMatchObject({ id: "imsa-2026-road-atlanta", name: "Motul Petit Le Mans", startDate: "2026-10-01" });
    expect(rounds[0].sessions.map((s) => [s.name, s.type, s.endIsEstimated])).toEqual([
      ["Practice 1", "practice", false],
      ["Qualifying", "qualifying", false],
      ["Race", "race", false],
    ]);
  });

  it.each([
    ["Rolex 24 At Daytona", "race"],
    ["Mobil 1 Twelve Hours of Sebring", "race"],
    ["Sahlen's Six Hours of The Glen", "race"],
    ["Warm-Up", "practice"],
    ["Qualifying - GTP", "qualifying"],
  ])("imsaSessionType(%s) = %s", (summary, type) => {
    expect(imsaSessionType(summary)).toBe(type);
  });
});
