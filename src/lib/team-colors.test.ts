import { describe, expect, it } from "vitest";
import { chosenPalette, colorParam, teamPalette } from "./team-colors";

// WCAG contrast, to check the fitted colours stay readable as lines on our surfaces.
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(x: string, y: string): number {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

// 2026 team colours as OpenF1 gives them.
const TEAMS = {
  mclaren: "F47600",
  redbull: "4781D7",
  mercedes: "00D7B6",
  ferrari: "ED1131",
  audi: "F50537",
  cadillac: "909090",
  haas: "9C9FA2",
  williams: "1868DB",
};

describe("teamPalette", () => {
  it("keeps distinct team colours solid", () => {
    const p = teamPalette(TEAMS.mclaren, TEAMS.mercedes);
    expect(p.dashedB).toBe(false);
    expect(p.a.light).not.toBe(p.b.light);
  });

  it("separates teammates by lightness and dashes driver B", () => {
    const p = teamPalette(TEAMS.redbull, TEAMS.redbull);
    expect(p.dashedB).toBe(true);
    expect(p.a.light).not.toBe(p.b.light);
    expect(p.a.dark).not.toBe(p.b.dark);
  });

  it("treats look-alike teams like teammates", () => {
    expect(teamPalette(TEAMS.ferrari, TEAMS.audi).dashedB).toBe(true);
    expect(teamPalette(TEAMS.cadillac, TEAMS.haas).dashedB).toBe(true);
  });

  it("keeps every colour readable on both surfaces", () => {
    for (const x of Object.values(TEAMS)) {
      for (const y of Object.values(TEAMS)) {
        const p = teamPalette(x, y);
        for (const c of [p.a, p.b]) {
          expect(contrast(c.light, "#ffffff"), `${x}/${y} light`).toBeGreaterThanOrEqual(2.9);
          expect(contrast(c.dark, "#0a0a0a"), `${x}/${y} dark`).toBeGreaterThanOrEqual(2.9);
        }
      }
    }
  });

  it("falls back to blue and orange without team colours", () => {
    expect(teamPalette(null, TEAMS.ferrari)).toEqual({
      a: { light: "#2a78d6", dark: "#3987e5" },
      b: { light: "#eb6834", dark: "#d95926" },
      dashedB: false,
    });
    expect(teamPalette("not a colour", TEAMS.ferrari).dashedB).toBe(false);
  });
});

describe("chosenPalette", () => {
  it("uses a picked colour as-is in both themes and keeps the team colour for the other driver", () => {
    const p = chosenPalette(TEAMS.mclaren, TEAMS.mercedes, "#ff00aa", null);
    expect(p.a).toEqual({ light: "#ff00aa", dark: "#ff00aa" });
    expect(p.b).toEqual(teamPalette(TEAMS.mclaren, TEAMS.mercedes).b);
    expect(p.dashedB).toBe(false);
  });

  it("dashes driver B when the picks are too alike", () => {
    expect(chosenPalette(TEAMS.mclaren, TEAMS.mercedes, "#ff0000", "#fe0505").dashedB).toBe(true);
  });

  it("is the team palette when nothing is picked", () => {
    expect(chosenPalette(TEAMS.redbull, TEAMS.redbull, null, null)).toEqual(teamPalette(TEAMS.redbull, TEAMS.redbull));
  });
});

describe("colorParam", () => {
  it("accepts six hex digits with or without #, and nothing else", () => {
    expect(colorParam("E8002D")).toBe("#e8002d");
    expect(colorParam("#e8002d")).toBe("#e8002d");
    expect(colorParam("red")).toBeNull();
    expect(colorParam(["e8002d"])).toBeNull();
    expect(colorParam(undefined)).toBeNull();
  });
});
