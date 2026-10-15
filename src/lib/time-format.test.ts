import { describe, expect, it } from "vitest";
import { resolveDisplayZone } from "./display-zone";
import {
  dayKey,
  filterTimeZones,
  formatClock,
  formatRoundDates,
  formatSessionDay,
  formatTimeRange,
  isValidTimeZone,
  zoneCity,
} from "./time-format";

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects junk", () => {
    expect(isValidTimeZone("America/Los_Angeles")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });
});

describe("Session time formatting", () => {
  const start = "2026-11-21T04:00:00Z"; // Las Vegas Qualifying
  const end = "2026-11-21T05:00:00Z";

  it("formats in Track Time", () => {
    expect(formatClock(start, "America/Los_Angeles", "en-GB")).toBe("20:00");
    expect(dayKey(start, "America/Los_Angeles")).toBe("2026-11-20");
    expect(formatSessionDay(start, "America/Los_Angeles", "en-GB")).toMatchObject({ weekday: "Fri", day: "20", month: "Nov" });
  });

  it("formats in another zone", () => {
    expect(formatClock(start, "Europe/London", "en-GB")).toBe("04:00");
    expect(formatSessionDay(start, "Asia/Tokyo", "en-GB")).toMatchObject({ weekday: "Sat", day: "21" });
  });

  it("uses 12-hour clocks where the locale does", () => {
    expect(formatClock(start, "America/Los_Angeles", "en-US")).toMatch(/^8:00\sPM$/);
  });

  it("formats a range, marking estimated ends and day roll-over", () => {
    expect(formatTimeRange(start, end, "Europe/London", "en-GB")).toBe("04:00 – 05:00");
    expect(formatTimeRange(start, end, "Europe/London", "en-GB", { endEstimated: true })).toBe("04:00 – ~05:00");
    expect(formatTimeRange("2026-06-13T14:00:00Z", "2026-06-14T14:00:00Z", "Europe/Paris", "en-GB")).toBe("16:00 – 16:00 (+1)");
  });
});

describe("Round dates", () => {
  it("collapses shared month and year", () => {
    expect(formatRoundDates("2026-11-19", "2026-11-21")).toBe("19–21 Nov 2026");
    expect(formatRoundDates("2026-10-30", "2026-11-01")).toBe("30 Oct – 1 Nov 2026");
    expect(formatRoundDates("2026-12-31", "2027-01-02")).toBe("31 Dec 2026 – 2 Jan 2027");
    expect(formatRoundDates("2026-06-13", "2026-06-13")).toBe("13 Jun 2026");
  });
});

describe("time zone search", () => {
  const zones = ["UTC", "America/Los_Angeles", "America/New_York", "Asia/Tokyo", "Europe/London"];
  it("matches ignoring case, underscores and slashes", () => {
    expect(filterTimeZones(zones, "new york")).toEqual(["America/New_York"]);
    expect(filterTimeZones(zones, "LOS_ANG")).toEqual(["America/Los_Angeles"]);
    expect(filterTimeZones(zones, "america")).toHaveLength(2);
    expect(filterTimeZones(zones, "")).toEqual(zones);
    expect(filterTimeZones(zones, "", 2)).toEqual(["UTC", "America/Los_Angeles"]);
  });
  it("derives a city name", () => {
    expect(zoneCity("America/Los_Angeles")).toBe("Los Angeles");
    expect(zoneCity("UTC")).toBe("UTC");
  });
});

describe("resolveDisplayZone", () => {
  const circuit = "America/Los_Angeles";
  const device = "Europe/London";
  it("defaults to Viewer Time on the device zone", () => {
    expect(resolveDisplayZone({ mode: "viewer" }, circuit, device)).toMatchObject({
      tz: device,
      mode: "viewer",
      label: "Times in your time · Europe/London",
    });
  });
  it("uses the Circuit zone for Track Time", () => {
    expect(resolveDisplayZone({ mode: "track" }, circuit, device)).toMatchObject({
      tz: circuit,
      label: "Track time · America/Los_Angeles",
    });
  });
  it("uses a valid custom zone and falls back otherwise", () => {
    expect(resolveDisplayZone({ mode: "custom", tz: "Asia/Tokyo" }, circuit, device).tz).toBe("Asia/Tokyo");
    expect(resolveDisplayZone({ mode: "custom", tz: "Nope/Nope" }, circuit, device)).toMatchObject({ tz: device, mode: "viewer" });
  });
});
