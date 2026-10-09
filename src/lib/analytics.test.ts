import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdkTrack = vi.fn();
const createTracwell = vi.fn(() => ({ track: sdkTrack }));
vi.mock("tracwell", () => ({ createTracwell }));

async function load() {
  vi.resetModules();
  return import("./analytics");
}

function stubBrowser(hostname: string) {
  vi.stubGlobal("window", { location: { hostname } });
  vi.stubGlobal("document", {});
}

beforeEach(() => {
  sdkTrack.mockReset();
  createTracwell.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("track", () => {
  it("is a silent no-op during server rendering", async () => {
    const { track, initAnalytics } = await load();
    expect(() => track("series_selected", { series: "f1" })).not.toThrow();
    initAnalytics();
    expect(createTracwell).not.toHaveBeenCalled();
    expect(sdkTrack).not.toHaveBeenCalled();
  });

  it("is safe before init and never creates a client on its own", async () => {
    stubBrowser("motorsportsinfo.app");
    const { track } = await load();
    expect(() => track("push_enabled", { series_count: 2 })).not.toThrow();
    expect(createTracwell).not.toHaveBeenCalled();
  });

  it("stays disabled outside production builds", async () => {
    stubBrowser("motorsportsinfo.app");
    const { track, initAnalytics } = await load();
    initAnalytics();
    track("radar_opened", { series: "f1" });
    expect(createTracwell).not.toHaveBeenCalled();
  });

  it("stays disabled on localhost even in a production build", async () => {
    vi.stubEnv("NODE_ENV", "production");
    stubBrowser("localhost");
    const { initAnalytics } = await load();
    initAnalytics();
    expect(createTracwell).not.toHaveBeenCalled();
  });

  it("creates exactly one client in production and forwards queued events", async () => {
    vi.stubEnv("NODE_ENV", "production");
    stubBrowser("motorsportsinfo.app");
    const { track, initAnalytics } = await load();
    track("units_changed", { temp: "c", wind: "kmh" });
    initAnalytics();
    initAnalytics();
    track("series_selected", { series: "f1" });

    expect(createTracwell).toHaveBeenCalledTimes(1);
    expect(createTracwell).toHaveBeenCalledWith({
      projectKey: "tw_live_c30cab1cc96e4c349fe89d7a22be92ab",
      collectionMode: "product",
      consent: "granted",
      respectDoNotTrack: true,
    });
    expect(sdkTrack.mock.calls).toEqual([
      ["units_changed", { temp: "c", wind: "kmh" }],
      ["series_selected", { series: "f1" }],
    ]);
  });

  it("never throws when the SDK throws", async () => {
    vi.stubEnv("NODE_ENV", "production");
    stubBrowser("motorsportsinfo.app");
    sdkTrack.mockImplementation(() => {
      throw new Error("boom");
    });
    const { track, initAnalytics } = await load();
    initAnalytics();
    expect(() => track("push_disabled", { series_count: 0 })).not.toThrow();
  });
});
