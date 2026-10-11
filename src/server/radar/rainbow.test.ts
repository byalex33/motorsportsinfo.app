import { describe, expect, it } from "vitest";
import { parseForecastTile, parseSnapshot, rainbowTileUrl, tileNearCircuit, usageMonth } from "./rainbow";

const silverstone = { lat: 52.0786, lon: -1.0169 };
const LATEST = 1791636000;
const SNAPSHOT = "1791636000";
// z7 tile containing Silverstone.
const near = { snapshot: SNAPSHOT, offset: "3600", z: "7", x: "63", y: "42" };

describe("forecast tile requests", () => {
  it("accepts a tile near the Circuit in the forecast window", () => {
    expect(parseForecastTile(near, LATEST, [silverstone])).toEqual({ snapshot: 1791636000, offset: 3600, z: 7, x: 63, y: 42 });
  });

  it("rejects tiles far from the Circuit", () => {
    expect(parseForecastTile({ ...near, x: "100", y: "60" }, LATEST, [silverstone])).toBeNull();
  });

  it("rejects zooms the map never asks for", () => {
    expect(parseForecastTile({ ...near, z: "3", x: "3", y: "2" }, LATEST, [silverstone])).toBeNull();
    expect(parseForecastTile({ ...near, z: "8", x: "127", y: "84" }, LATEST, [silverstone])).toBeNull();
  });

  it("rejects offsets off the 10-minute grid or beyond 2 hours", () => {
    expect(parseForecastTile({ ...near, offset: "300" }, LATEST, [silverstone])).toBeNull();
    expect(parseForecastTile({ ...near, offset: "7200" }, LATEST, [silverstone])).not.toBeNull();
    expect(parseForecastTile({ ...near, offset: "7800" }, LATEST, [silverstone])).toBeNull();
  });

  it("accepts the latest snapshot and the two before it, for viewers who haven't refreshed yet", () => {
    for (const back of [0, 1, 2]) {
      const snapshot = String(LATEST - back * 600);
      expect(parseForecastTile({ ...near, snapshot }, LATEST, [silverstone])).toMatchObject({ snapshot: Number(snapshot) });
    }
  });

  it("rejects snapshots off the grid, newer than the latest or older than the two before it", () => {
    expect(parseForecastTile({ ...near, snapshot: "1791636060" }, LATEST, [silverstone])).toBeNull();
    expect(parseForecastTile({ ...near, snapshot: String(LATEST + 600) }, LATEST, [silverstone])).toBeNull();
    expect(parseForecastTile({ ...near, snapshot: String(LATEST - 3 * 600) }, LATEST, [silverstone])).toBeNull();
    expect(parseForecastTile({ ...near, snapshot: String(LATEST - 3 * 3600) }, LATEST, [silverstone])).toBeNull();
  });

  it("rejects every tile when no Circuit's radar can be open", () => {
    expect(parseForecastTile(near, LATEST, [])).toBeNull();
  });

  it("rejects malformed segments and out-of-range tiles", () => {
    expect(parseForecastTile({ ...near, x: "-1" }, LATEST, [silverstone])).toBeNull();
    expect(parseForecastTile({ ...near, x: "6.5" }, LATEST, [silverstone])).toBeNull();
    expect(parseForecastTile({ ...near, y: "128" }, LATEST, [silverstone])).toBeNull();
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
