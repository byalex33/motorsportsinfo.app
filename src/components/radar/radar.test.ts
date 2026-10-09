import { describe, expect, it } from "vitest";
import type { Session } from "@/domain/types";
import sample from "./fixtures/weather-maps.sample.json";
import { radarWindowSession } from "./radar-window";
import { buildRadarFrames, formatFrameAge, formatFrameClock } from "./rainviewer";

const MIN = 60_000;

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: "f1-2026-silverstone:race",
    roundId: "f1-2026-silverstone",
    series: "f1",
    type: "race",
    name: "Race",
    startsAt: "2026-07-05T14:00:00Z",
    endsAt: "2026-07-05T16:00:00Z",
    endIsEstimated: false,
    status: "scheduled",
    ...overrides,
  };
}

describe("radar window", () => {
  const start = Date.parse("2026-07-05T14:00:00Z");
  const end = Date.parse("2026-07-05T16:00:00Z");
  const race = session();

  it("is closed more than 60 minutes before the start", () => {
    expect(radarWindowSession([race], start - 61 * MIN)).toBeNull();
  });

  it("opens 60 minutes before the start", () => {
    expect(radarWindowSession([race], start - 60 * MIN)).toBe(race);
    expect(radarWindowSession([race], start - 30 * MIN)).toBe(race);
  });

  it("stays open during the Session until it ends", () => {
    expect(radarWindowSession([race], start + 45 * MIN)).toBe(race);
    expect(radarWindowSession([race], end)).toBe(race);
  });

  it("closes after the end", () => {
    expect(radarWindowSession([race], end + 1)).toBeNull();
  });

  it("ignores cancelled Sessions", () => {
    const cancelled = session({ status: "cancelled" });
    expect(radarWindowSession([cancelled], start)).toBeNull();
  });

  it("picks any open Session among several", () => {
    const fp1 = session({ id: "x:fp1", startsAt: "2026-07-04T10:00:00Z", endsAt: "2026-07-04T11:00:00Z" });
    const cancelledQuali = session({
      id: "x:q",
      status: "cancelled",
      startsAt: "2026-07-05T11:00:00Z",
      endsAt: "2026-07-05T12:00:00Z",
    });
    const sessions = [fp1, cancelledQuali, race];
    expect(radarWindowSession(sessions, Date.parse("2026-07-04T10:30:00Z"))).toBe(fp1);
    expect(radarWindowSession(sessions, Date.parse("2026-07-05T11:30:00Z"))).toBeNull();
    expect(radarWindowSession(sessions, Date.parse("2026-07-05T13:30:00Z"))).toBe(race);
  });
});

describe("RainViewer frames", () => {
  it("builds tile URLs from host + path for every past frame, oldest first", () => {
    const frames = buildRadarFrames(sample);
    expect(frames).toHaveLength(13);
    expect(frames[0]).toEqual({
      time: 1791501600,
      id: "radar-v2-radar-6d0599094357",
      tileUrl: "https://tilecache.rainviewer.com/v2/radar/6d0599094357/256/{z}/{x}/{y}/2/1_1.png",
    });
    expect(frames.at(-1)?.tileUrl).toBe(
      "https://tilecache.rainviewer.com/v2/radar/c3cfcdd7992a/256/{z}/{x}/{y}/2/1_1.png",
    );
    for (let i = 1; i < frames.length; i++) expect(frames[i].time - frames[i - 1].time).toBe(600);
    expect(new Set(frames.map((f) => f.id)).size).toBe(frames.length);
  });

  it("never derives URLs from timestamps", () => {
    for (const f of buildRadarFrames(sample)) expect(f.tileUrl).not.toContain(String(f.time));
  });

  it("sorts unsorted frames and tolerates a trailing slash on host", () => {
    const frames = buildRadarFrames({
      host: "https://tilecache.rainviewer.com/",
      radar: { past: [{ time: 20, path: "/v2/radar/b" }, { time: 10, path: "/v2/radar/a" }] },
    });
    expect(frames.map((f) => f.time)).toEqual([10, 20]);
    expect(frames[0].tileUrl).toBe("https://tilecache.rainviewer.com/v2/radar/a/256/{z}/{x}/{y}/2/1_1.png");
  });

  it("rejects unexpected payloads", () => {
    expect(() => buildRadarFrames({})).toThrow();
    expect(() => buildRadarFrames({ host: "http://insecure", radar: { past: [] } })).toThrow();
    expect(() => buildRadarFrames({ host: "https://x", radar: { past: [{ time: "1" }] } })).toThrow();
  });

  it("formats the frame label", () => {
    expect(formatFrameClock(Date.parse("2026-10-09T13:20:00Z") / 1000, "Europe/London")).toBe("14:20");
    const t = Date.parse("2026-10-09T13:20:00Z");
    expect(formatFrameAge(t / 1000, t + 20_000)).toBe("just now");
    expect(formatFrameAge(t / 1000, t + 40 * MIN)).toBe("40 min ago");
    expect(formatFrameAge(t / 1000, t + 125 * MIN)).toBe("2 h 5 min ago");
  });
});
