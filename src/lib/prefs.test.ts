import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TIME_PREF,
  PREF_KEYS,
  defaultUnitsForLocale,
  parseSavedAlerts,
  parseSeriesPref,
  parseTimePref,
  parseUnitsPref,
  readPref,
  writePref,
} from "./prefs";

describe("storage keys (shared contract with alerts)", () => {
  it("are stable", () => {
    expect(PREF_KEYS).toEqual({ series: "msi.series", time: "msi.time", units: "msi.units", openSourceNote: "msi.oss-note", announcement: "msi.announcement", alerts: "msi.alerts" });
  });
});

describe("parseSeriesPref", () => {
  it("accepts Series ids only", () => {
    expect(parseSeriesPref("wec")).toBe("wec");
    expect(parseSeriesPref("F1")).toBeNull();
    expect(parseSeriesPref('"f1"')).toBeNull();
    expect(parseSeriesPref(null)).toBeNull();
    expect(parseSeriesPref(undefined)).toBeNull();
  });
});

describe("parseTimePref", () => {
  it("reads valid values", () => {
    expect(parseTimePref('{"mode":"viewer"}')).toEqual({ mode: "viewer" });
    expect(parseTimePref('{"mode":"track","tz":"ignored"}')).toEqual({ mode: "track" });
    expect(parseTimePref('{"mode":"custom","tz":"Asia/Tokyo"}')).toEqual({ mode: "custom", tz: "Asia/Tokyo" });
  });
  it("falls back to Viewer Time on bad JSON or shapes", () => {
    for (const raw of [null, undefined, "", "{", "not json", "null", "42", "[]", '"viewer"', '{"mode":"utc"}', '{"mode":"custom"}', '{"mode":"custom","tz":"Mars/Base"}']) {
      expect(parseTimePref(raw)).toEqual(DEFAULT_TIME_PREF);
    }
  });
});

describe("parseUnitsPref", () => {
  it("reads valid values", () => {
    expect(parseUnitsPref('{"temp":"f","wind":"mph"}')).toEqual({ temp: "f", wind: "mph" });
    expect(parseUnitsPref('{"temp":"c","wind":"kmh","extra":1}')).toEqual({ temp: "c", wind: "kmh" });
  });
  it("returns null on bad JSON or shapes", () => {
    for (const raw of [null, "", "{oops", "true", '{"temp":"k","wind":"kmh"}', '{"temp":"c"}', '{"temp":"c","wind":"knots"}']) {
      expect(parseUnitsPref(raw)).toBeNull();
    }
  });
});

describe("parseSavedAlerts", () => {
  it("reads saved ticks and lead time, normalizing junk", () => {
    expect(parseSavedAlerts(JSON.stringify({ follows: { f1: ["race", "nope"], x: ["race"] }, leadMinutes: 60 }))).toEqual({
      follows: { f1: ["race"] },
      leadMinutes: 60,
      documentAlerts: {},
    });
  });
  it("reads saved Document Alerts, dropping unknown Series and levels", () => {
    const raw = JSON.stringify({ follows: {}, leadMinutes: 15, documentAlerts: { f1: "all", wec: "all", f2: "x" } });
    expect(parseSavedAlerts(raw)?.documentAlerts).toEqual({ f1: "all" });
  });
  it("falls back to 15 minutes for an unknown lead time", () => {
    expect(parseSavedAlerts(JSON.stringify({ follows: {}, leadMinutes: 7 }))?.leadMinutes).toBe(15);
  });
  it("returns null for missing or malformed data", () => {
    expect(parseSavedAlerts(null)).toBeNull();
    expect(parseSavedAlerts(undefined)).toBeNull();
    expect(parseSavedAlerts("not json")).toBeNull();
    expect(parseSavedAlerts("null")).toBeNull();
    expect(parseSavedAlerts(JSON.stringify({ leadMinutes: 15 }))).toBeNull();
  });
});

describe("defaultUnitsForLocale", () => {
  it("uses °F and mph in the US", () => {
    expect(defaultUnitsForLocale("en-US")).toEqual({ temp: "f", wind: "mph" });
    expect(defaultUnitsForLocale("en")).toEqual({ temp: "f", wind: "mph" }); // maximises to en-Latn-US
  });
  it("uses °C with mph in the UK and °C/km/h elsewhere", () => {
    expect(defaultUnitsForLocale("en-GB")).toEqual({ temp: "c", wind: "mph" });
    expect(defaultUnitsForLocale("de-DE")).toEqual({ temp: "c", wind: "kmh" });
    expect(defaultUnitsForLocale("ja")).toEqual({ temp: "c", wind: "kmh" });
  });
  it("copes with missing or invalid locales", () => {
    expect(defaultUnitsForLocale(undefined)).toEqual({ temp: "c", wind: "kmh" });
    expect(defaultUnitsForLocale("!!")).toEqual({ temp: "c", wind: "kmh" });
  });
});

describe("readPref / writePref without working storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the value in memory when localStorage throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    vi.stubGlobal("window", { localStorage: throwing, addEventListener() {}, removeEventListener() {} });
    expect(readPref(PREF_KEYS.series)).toBeNull();
    writePref(PREF_KEYS.series, "f2");
    expect(readPref(PREF_KEYS.series)).toBe("f2");
  });

  it("returns null when there is no window at all", () => {
    expect(readPref(PREF_KEYS.units)).toBeNull();
  });
});
