import { describe, expect, it } from "vitest";
import type { OpenF1Session } from "@/server/schedule/sources/openf1";
import { formatLapTime, matchOpenF1Session, parseOpenF1Result, type OpenF1Driver, type OpenF1SessionResult } from "./openf1";

function openF1Session(session_key: number, session_name: string, date_start: string): OpenF1Session {
  return {
    session_key,
    session_name,
    session_type: session_name,
    date_start,
    date_end: null,
    meeting_key: 1296,
    circuit_short_name: "Singapore",
    location: "Marina Bay",
    gmt_offset: "08:00:00",
    year: 2026,
  };
}

// Singapore 2026, as OpenF1 lists it.
const SINGAPORE = [
  openF1Session(11378, "Practice 1", "2026-10-09T08:30:00+00:00"),
  openF1Session(11379, "Sprint Qualifying", "2026-10-09T12:30:00+00:00"),
  openF1Session(11380, "Sprint", "2026-10-10T09:00:00+00:00"),
  openF1Session(11381, "Qualifying", "2026-10-10T13:00:00+00:00"),
  openF1Session(11382, "Race", "2026-10-11T12:00:00+00:00"),
];

function driver(driver_number: number, first_name: string, last_name: string, team_name: string, session_key = 11731): OpenF1Driver {
  return {
    session_key,
    driver_number,
    name_acronym: last_name.slice(0, 3).toUpperCase(),
    first_name,
    last_name,
    full_name: `${first_name} ${last_name.toUpperCase()}`,
    team_name,
  };
}

const DRIVERS = [
  driver(3, "Max", "Verstappen", "Red Bull Racing"),
  driver(12, "Kimi", "Antonelli", "Mercedes"),
  driver(44, "Lewis", "Hamilton", "Ferrari"),
  driver(63, "George", "Russell", "Mercedes"),
  driver(23, "Alexander", "Albon", "Williams"),
  driver(18, "Lance", "Stroll", "Aston Martin"),
  driver(10, "Pierre", "Gasly", "Alpine"),
];

function row(session_key: number, position: number | null, driver_number: number, extra: Partial<OpenF1SessionResult>): OpenF1SessionResult {
  return { session_key, position, driver_number, dnf: false, dns: false, dsq: false, duration: null, gap_to_leader: null, ...extra };
}

describe("matchOpenF1Session", () => {
  it("matches the OpenF1 Session of the same type at the same start", () => {
    expect(matchOpenF1Session({ type: "sprint-qualifying", startsAt: "2026-10-09T12:30:00.000Z" }, SINGAPORE)?.session_key).toBe(11379);
  });

  it("still matches a Session whose start an override moved", () => {
    expect(matchOpenF1Session({ type: "race", startsAt: "2026-10-11T13:00:00.000Z" }, SINGAPORE)?.session_key).toBe(11382);
  });

  it("picks the nearest of several Sessions of one type", () => {
    const practice = [
      openF1Session(1, "Practice 1", "2026-05-01T11:30:00Z"),
      openF1Session(2, "Practice 2", "2026-05-01T15:00:00Z"),
    ];
    expect(matchOpenF1Session({ type: "practice", startsAt: "2026-05-01T15:00:00Z" }, practice)?.session_key).toBe(2);
  });

  it("returns null when nothing of that type is close", () => {
    expect(matchOpenF1Session({ type: "qualifying", startsAt: "2026-10-03T08:00:00Z" }, SINGAPORE)).toBeNull();
  });
});

describe("parseOpenF1Result", () => {
  it("gives a race's full classification: winner's time, gaps, laps down, retirements", () => {
    // Malaysia 2026 Race, trimmed; OpenF1 lists unclassified drivers last with no position.
    const results = [
      row(11731, null, 23, { dnf: true }),
      row(11731, 2, 12, { duration: 6437.115, gap_to_leader: 2.307 }),
      row(11731, 1, 3, { duration: 6434.808, gap_to_leader: 0 }),
      row(11731, 3, 44, { duration: 6439.727, gap_to_leader: 4.919 }),
      row(11731, 4, 18, { gap_to_leader: "+1 LAP" }),
      row(11731, 5, 63, { dnf: true }),
      row(11731, null, 10, { dns: true }),
    ];
    expect(parseOpenF1Result(11731, results, DRIVERS)).toEqual({
      entries: [
        { position: 1, name: "Max Verstappen", team: "Red Bull Racing", time: "1:47:14.808" },
        { position: 2, name: "Kimi Antonelli", team: "Mercedes", time: "+2.307" },
        { position: 3, name: "Lewis Hamilton", team: "Ferrari", time: "+4.919" },
        { position: 4, name: "Lance Stroll", team: "Aston Martin", time: "+1 LAP" },
        { position: 5, name: "George Russell", team: "Mercedes", time: "DNF" },
        { position: null, name: "Alexander Albon", team: "Williams", time: "DNF" },
        { position: null, name: "Pierre Gasly", team: "Alpine", time: "DNS" },
      ],
    });
  });

  it("shows each qualifier's best lap from the last segment they reached", () => {
    const results = [
      row(11730, 1, 3, { duration: [96.477, 95.696, 95.13], gap_to_leader: [0, 0, 0] }),
      row(11730, 15, 23, { dnf: true, duration: [97.179, null, null], gap_to_leader: [0.702, null, null] }),
      row(11730, 20, 10, { dns: true, duration: [null, null, null], gap_to_leader: [null, null, null] }),
      row(11730, null, 18, { dsq: true, duration: [97.5, null, null], gap_to_leader: [1.0, null, null] }),
    ];
    expect(parseOpenF1Result(11730, results, DRIVERS)?.entries.map((e) => [e.position, e.time])).toEqual([
      [1, "1:35.130"],
      [15, "1:37.179"],
      [20, "DNS"],
      [null, "DSQ"],
    ]);
  });

  it("shows practice as the fastest lap, then gaps", () => {
    const results = [
      row(11378, 2, 12, { duration: 92.472, gap_to_leader: 0.198 }),
      row(11378, 1, 63, { duration: 92.274, gap_to_leader: 0 }),
    ];
    expect(parseOpenF1Result(11378, results, DRIVERS)?.entries.map((e) => e.time)).toEqual(["1:32.274", "+0.198"]);
  });

  it("falls back to another Session's driver list, then to the car number", () => {
    const results = [row(11378, 1, 63, { duration: 92.274 }), row(11378, 2, 99, { gap_to_leader: 0.5 })];
    expect(parseOpenF1Result(11378, results, DRIVERS)?.entries).toEqual([
      { position: 1, name: "George Russell", team: "Mercedes", time: "1:32.274" },
      { position: 2, name: "Car 99", team: null, time: "+0.500" },
    ]);
  });

  it("returns null before OpenF1 has a classification", () => {
    expect(parseOpenF1Result(11380, [row(11731, 1, 3, {})], DRIVERS)).toBeNull();
    expect(parseOpenF1Result(11380, [row(11380, null, 3, { dnf: true })], DRIVERS)).toBeNull();
  });
});

describe("formatLapTime", () => {
  it("formats laps and race times without float drift", () => {
    expect(formatLapTime(92.274)).toBe("1:32.274");
    expect(formatLapTime(59.9996)).toBe("1:00.000");
    expect(formatLapTime(6434.808)).toBe("1:47:14.808");
    expect(formatLapTime(3600)).toBe("1:00:00.000");
  });
});
