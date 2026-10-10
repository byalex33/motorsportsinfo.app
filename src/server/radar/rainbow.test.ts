import { describe, expect, it } from "vitest";
import { parseForecastTile, parseSnapshot, rainbowTileUrl, tileNearCircuit, usageMonth } from "./rainbow";

const silverstone = { lat: 52.0786, lon: -1.0169 };
const NOW = 1791636000 + 120;
const SNAPSHOT = "1791636000";
// z7 tile containing Silverstone.
const near = { snapshot: SNAPSHOT, offset: "3600", z: "7", x: "63", y: "42" };

describe("forecast tile requests", () => {
  it("accepts a tile near a Circuit in the forecast window", () => {
    expect(parseForecastTile(near, NOW, [silverstone])).toEqual({ snapshot: 1791636000, offset: 3600, z: 7, x: 63, y: 42 });
  });

  it("rejects tiles far from every Circuit", () => {
    expect(parseForecastTile({ ...near, x: "100", y: "60" }, NOW, [silverstone])).toBeNull();
  });

  it("rejects zooms the map never asks for", () => {
    expect(parseForecastTile({ ...near, z: "3", x: "3", y: "2" }, NOW, [silverstone])).toBeNull();
    expect(parseForecastTile({ ...near, z: "8", x: "127", y: "84" }, NOW, [silverstone])).toBeNull();
  });

  it("rejects offsets off the 10-minute grid or beyond 2 hours", () => {
    expect(parseForecastTile({ ...near, offset: "300" }, NOW, [silverstone])).toBeNull();
    expect(parseForecastTile({ ...near, offset: "7200" }, NOW, [silverstone])).not.toBeNull();
    expect(parseForecastTile({ ...near, offset: "7800" }, NOW, [silverstone])).toBeNull();
  });

  it("rejects snapshots off the grid, in the future or too old", () => {
    expect(parseForecastTile({ ...near, snapshot: "1791636060" }, NOW, [silverstone])).toBeNull();
    expect(parseForecastTile({ ...near, snapshot: String(1791636000 + 1200) }, NOW, [silverstone])).toBeNull();
    expect(parseForecastTile({ ...near, snapshot: String(1791636000 - 3 * 3600) }, NOW, [silverstone])).toBeNull();
  });

  it("rejects malformed segments and out-of-range tiles", () => {
    expect(parseForecastTile({ ...near, x: "-1" }, NOW, [silverstone])).toBeNull();
    expect(parseForecastTile({ ...near, x: "6.5" }, NOW, [silverstone])).toBeNull();
    expect(parseForecastTile({ ...near, y: "128" }, NOW, [silverstone])).toBeNull();
  });

  it("builds Rainbow's tile URL with the radar layer and Universal Blue colours", () => {
    expect(rainbowTileUrl({ snapshot: 1791636000, offset: 600, z: 7, x: 63, y: 42 })).toBe(
      "https://api.rainbow.ai/tiles/v1/precip/1791636000/600/7/63/42?color=8",
    );
  });
});

describe("tileNearCircuit", () => {
  it("includes tiles overlapping the pan box and excludes those outside it", () => {
    // z4 tile 7/5 spans lon -22.5…0, lat ~40.98…55.78: overlaps Silverstone's box.
    expect(tileNearCircuit(4, 7, 5, silverstone)).toBe(true);
    // z7 tile 72/42 starts at lon 22.5, well east of -1 + 8.
    expect(tileNearCircuit(7, 72, 42, silverstone)).toBe(false);
  });
});

describe("parseSnapshot", () => {
  it("reads Rainbow's snapshot and rejects anything else", () => {
    expect(parseSnapshot({ snapshot: 1754991000 })).toBe(1754991000);
    expect(parseSnapshot({ snapshot: 1754991001 })).toBeNull();
    expect(parseSnapshot({ snapshot: "1754991000" })).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
  });
});

describe("usageMonth", () => {
  it("is the UTC month", () => {
    expect(usageMonth(new Date("2026-10-31T23:59:00-02:00"))).toBe("2026-11");
    expect(usageMonth(new Date("2026-10-10T12:00:00Z"))).toBe("2026-10");
  });
});
