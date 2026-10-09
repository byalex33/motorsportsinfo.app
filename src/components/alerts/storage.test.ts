import { describe, expect, it } from "vitest";
import { parseRememberedSeries, parseSavedAlerts } from "./storage";

describe("parseRememberedSeries", () => {
  it("accepts a bare or JSON-encoded SeriesId", () => {
    expect(parseRememberedSeries("wec")).toBe("wec");
    expect(parseRememberedSeries('"f2"')).toBe("f2");
  });
  it("ignores anything else", () => {
    expect(parseRememberedSeries(null)).toBeNull();
    expect(parseRememberedSeries("nascar")).toBeNull();
    expect(parseRememberedSeries("{")).toBeNull();
  });
});

describe("parseSavedAlerts", () => {
  it("reads saved ticks and lead time, normalizing junk", () => {
    expect(parseSavedAlerts(JSON.stringify({ follows: { f1: ["race", "nope"], x: ["race"] }, leadMinutes: 60 }))).toEqual({
      follows: { f1: ["race"] },
      leadMinutes: 60,
    });
  });
  it("falls back to 15 minutes for an unknown lead time", () => {
    expect(parseSavedAlerts(JSON.stringify({ follows: {}, leadMinutes: 7 }))?.leadMinutes).toBe(15);
  });
  it("returns null for missing or malformed data", () => {
    expect(parseSavedAlerts(null)).toBeNull();
    expect(parseSavedAlerts("not json")).toBeNull();
    expect(parseSavedAlerts("null")).toBeNull();
    expect(parseSavedAlerts(JSON.stringify({ leadMinutes: 15 }))).toBeNull();
  });
});
