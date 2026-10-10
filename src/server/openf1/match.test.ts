import { describe, expect, it } from "vitest";
import type { OpenF1Session } from "@/server/schedule/sources/openf1";
import { matchOpenF1Session } from "./match";

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
