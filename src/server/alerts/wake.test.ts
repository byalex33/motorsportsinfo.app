import { describe, expect, it } from "vitest";
import { makeRound, makeSession } from "@/server/schedule/test-utils";
import { reminderSessionStarts, remindersMayBeDue } from "./wake";

const MINUTE = 60_000;
const NOW = new Date("2026-10-30T12:00:00Z");
const at = (minutesFromNow: number) => new Date(NOW.getTime() + minutesFromNow * MINUTE).toISOString();

describe("reminderSessionStarts", () => {
  const round = makeRound("f1-2026-mexico", "mexico-city", "2026-10-30", "2026-11-01");

  it("keeps the scheduled Sessions still to come of Rounds with confirmed times", () => {
    const schedules = [
      {
        round,
        sessions: [
          makeSession(round.id, "past", at(-30)),
          makeSession(round.id, "next", at(30)),
          makeSession(round.id, "cancelled", at(45), { status: "cancelled" }),
        ],
      },
      {
        round: makeRound("f2-2026-tbc", "mexico-city", "2026-10-30", "2026-11-01", { sessionTimesConfirmed: false }),
        sessions: [makeSession("f2-2026-tbc", "tbc", at(30))],
      },
    ];
    expect(reminderSessionStarts(schedules, NOW.getTime())).toEqual([Date.parse(at(30))]);
  });
});

describe("remindersMayBeDue", () => {
  it("is true from each lead time's reminder time through the catch-up window", () => {
    for (const lead of [15, 60, 1440]) {
      expect(remindersMayBeDue([Date.parse(at(lead))], NOW)).toBe(true);
      expect(remindersMayBeDue([Date.parse(at(lead - 9))], NOW)).toBe(true);
    }
  });

  it("is false between reminder times, so the run doesn't read the database", () => {
    expect(remindersMayBeDue([], NOW)).toBe(false);
    expect(remindersMayBeDue([Date.parse(at(16)), Date.parse(at(45)), Date.parse(at(61)), Date.parse(at(300))], NOW)).toBe(false);
    // Past the 10-minute catch-up window of the 15-minute lead.
    expect(remindersMayBeDue([Date.parse(at(5))], NOW)).toBe(false);
  });
});
