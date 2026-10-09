import { describe, expect, it } from "vitest";
import { SERIES } from "@/domain/series";
import { SERIES_IDS } from "@/domain/types";
import {
  calendarFeedLinks,
  calendarFeedPath,
  decodeSelection,
  defaultFollows,
  encodeSelection,
  normalizeFollows,
  parseCalendarSegment,
  toggleFollow,
  type Follows,
} from "./selection";

describe("encodeSelection / decodeSelection", () => {
  it("round-trips every Series with every Session Type", () => {
    const all: Follows = Object.fromEntries(SERIES_IDS.map((s) => [s, [...SERIES[s].sessionTypes]]));
    const spec = encodeSelection(all);
    expect(spec).toBe("f1-p-sq-s-q-r_f2-p-q-sr-fr_f3-p-q-sr-fr_wec-p-q-h-r_fe-p-q-r_indycar-p-q-r_motogp-p-q-s-r");
    expect(decodeSelection(spec)).toEqual(all);
  });

  it("round-trips each single Session Type of each Series", () => {
    for (const series of SERIES_IDS) {
      for (const type of SERIES[series].sessionTypes) {
        const follows: Follows = { [series]: [type] };
        expect(decodeSelection(encodeSelection(follows))).toEqual(follows);
      }
    }
  });

  it("is canonical regardless of input order", () => {
    const a = encodeSelection({ wec: ["race", "hyperpole"], f1: ["race", "qualifying"] });
    const b = encodeSelection({ f1: ["qualifying", "race"], wec: ["hyperpole", "race"] });
    expect(a).toBe("f1-q-r_wec-h-r");
    expect(b).toBe(a);
  });

  it("drops Series with nothing ticked", () => {
    expect(encodeSelection({ f1: [], f2: ["qualifying"] })).toBe("f2-q");
    expect(encodeSelection({})).toBe("");
  });

  it.each([
    "",
    "f1",
    "f1-",
    "f1-x",
    "f9-q",
    "f1-q_f1-r",
    "f1-q-q",
    "f2-h", // Hyperpole is WEC only
    "f1-sr", // Sprint Race is F2/F3 only
    "wec-q__f1-r",
    "F1-q",
    "x".repeat(300),
  ])("rejects %j", (spec) => {
    expect(decodeSelection(spec)).toBeNull();
  });

  it("decodes non-canonical order to the canonical selection", () => {
    expect(decodeSelection("wec-r-h_f1-r-q")).toEqual({ f1: ["qualifying", "race"], wec: ["hyperpole", "race"] });
  });
});

describe("calendar feed URLs", () => {
  it("builds the path and parses the route segment with or without .ics", () => {
    const follows: Follows = { f1: ["qualifying", "race"] };
    expect(calendarFeedPath(follows)).toBe("/calendar/f1-q-r.ics");
    expect(parseCalendarSegment("f1-q-r.ics")).toEqual(follows);
    expect(parseCalendarSegment("f1-q-r")).toEqual(follows);
    expect(parseCalendarSegment("f1-q-r.ics.ics")).toBeNull();
    expect(calendarFeedPath({})).toBeNull();
  });

  it("builds copy, webcal and Google Calendar links", () => {
    const links = calendarFeedLinks("motorsportsinfo.app", "https:", { wec: ["race"] });
    expect(links).toEqual({
      httpUrl: "https://motorsportsinfo.app/calendar/wec-r.ics",
      webcalUrl: "webcal://motorsportsinfo.app/calendar/wec-r.ics",
      googleUrl:
        "https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fmotorsportsinfo.app%2Fcalendar%2Fwec-r.ics",
    });
    expect(calendarFeedLinks("motorsportsinfo.app", "https:", {})).toBeNull();
  });
});

describe("follows helpers", () => {
  it("defaults to the remembered Series' default reminder types only", () => {
    expect(defaultFollows("f1")).toEqual({ f1: ["sprint", "qualifying", "race"] });
    expect(defaultFollows("wec")).toEqual({ wec: ["qualifying", "race"] });
    expect(defaultFollows(null)).toEqual({});
  });

  it("normalizes: drops unknown Series and types, dedupes, orders", () => {
    expect(
      normalizeFollows({
        f1: ["race", "race", "hyperpole", "practice"],
        nascar: ["race"],
        f2: "qualifying" as unknown as string[],
        wec: [],
      }),
    ).toEqual({ f1: ["practice", "race"] });
  });

  it("toggles a Session Type on and off", () => {
    const on = toggleFollow({}, "f3", "feature-race", true);
    expect(on).toEqual({ f3: ["feature-race"] });
    expect(toggleFollow(on, "f3", "feature-race", false)).toEqual({});
  });
});
