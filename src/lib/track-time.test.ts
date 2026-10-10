import { describe, expect, it } from "vitest";
import { singaporeSessions } from "./seo/test-fixtures";
import { isoWithOffset, sessionStartSentence, trackTimeText, trackTimeTexts } from "./track-time";

const qualifying = singaporeSessions[3];

describe("trackTimeText", () => {
  it("formats a Session in Track Time with a fixed 24-hour locale", () => {
    expect(trackTimeText(qualifying, "Asia/Singapore")).toEqual({
      weekday: "Sat",
      day: "10",
      long: "Saturday 10 October",
      date: "Sat 10 Oct 2026",
      clock: "21:00",
      range: "21:00 – 22:00",
      offset: "GMT+8",
      utcClock: "13:00",
    });
  });

  it("keys every Session by id", () => {
    expect(Object.keys(trackTimeTexts(singaporeSessions, "Asia/Singapore"))).toEqual(singaporeSessions.map((s) => s.id));
  });
});

describe("sessionStartSentence", () => {
  it("gives Track Time with its offset and UTC", () => {
    const text = trackTimeText(qualifying, "Asia/Singapore");
    expect(sessionStartSentence("Qualifying", text)).toBe("Qualifying starts Sat 10 Oct 2026, 21:00 track time (GMT+8) · 13:00 UTC.");
    expect(sessionStartSentence("Qualifying", text, true)).toBe("Qualifying is live. It started Sat 10 Oct 2026, 21:00 track time (GMT+8) · 13:00 UTC.");
  });
});

describe("isoWithOffset", () => {
  it("writes wall time with the zone's offset at that instant", () => {
    expect(isoWithOffset("2026-10-10T13:00:00Z", "Asia/Singapore")).toBe("2026-10-10T21:00:00+08:00");
    expect(isoWithOffset("2026-11-22T04:00:00Z", "America/Los_Angeles")).toBe("2026-11-21T20:00:00-08:00");
    expect(isoWithOffset("2026-07-05T14:00:00Z", "Europe/London")).toBe("2026-07-05T15:00:00+01:00");
    expect(isoWithOffset("2026-01-05T14:00:00Z", "Europe/London")).toBe("2026-01-05T14:00:00+00:00");
    expect(isoWithOffset("2026-03-01T10:00:00Z", "Asia/Kolkata")).toBe("2026-03-01T15:30:00+05:30");
  });
});
