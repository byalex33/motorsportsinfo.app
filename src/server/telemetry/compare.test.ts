import { describe, expect, it } from "vitest";
import { compareLaps, type LapInput } from "./compare";
import type { OpenF1CarData, OpenF1Location } from "./openf1";

const START = Date.parse("2026-10-09T13:00:00Z");
const iso = (t: number) => new Date(START + t * 1000).toISOString();

/**
 * A lap at a constant speed round a 1000 m circle, sampled every 0.25 s like OpenF1. `brakeFrom` puts the
 * brake on (and the throttle off) from that many seconds in.
 */
function lap(kmh: number, opts: { brakeFrom?: number; startOffset?: number } = {}): LapInput {
  const time = 1000 / (kmh / 3.6);
  const startsAt = iso(opts.startOffset ?? 0);
  const begin = Date.parse(startsAt);
  const car: OpenF1CarData[] = [];
  const location: OpenF1Location[] = [];
  for (let t = 0.1; t < time; t += 0.25) {
    const braking = opts.brakeFrom !== undefined && t >= opts.brakeFrom;
    const date = new Date(begin + t * 1000).toISOString();
    car.push({ date, speed: kmh, throttle: braking ? 0 : 100, brake: braking ? 100 : 0, n_gear: 7 });
    const angle = (2 * Math.PI * t) / time;
    location.push({ date, x: 1000 * Math.cos(angle), y: 1000 * Math.sin(angle) });
  }
  return { lap: 1, time, startsAt, car, location };
}

describe("compareLaps", () => {
  it("puts both laps on one distance grid and tracks the gap", () => {
    // 200 km/h laps the 1000 m in 18 s; 180 km/h takes 20 s.
    const c = compareLaps(lap(200), lap(180, { startOffset: 600 }))!;
    expect(c.distance[0]).toBe(0);
    expect(c.distance.at(-1)).toBeGreaterThan(990);
    expect(c.distance.at(-1)).toBeLessThan(1010);
    expect(c.distance).toHaveLength(c.a.speed.length);
    expect(c.a.speed.every((v) => v === 200)).toBe(true);
    expect(c.b.speed.every((v) => v === 180)).toBe(true);
    expect(c.delta[0]).toBe(0);
    // Halfway the slower car is a second down; at the line, two.
    expect(c.delta[Math.round(c.delta.length / 2)]).toBeCloseTo(1, 1);
    expect(c.delta.at(-1)).toBeCloseTo(2, 2);
  });

  it("splits the lap into mini-sectors that add up to the lap-time difference", () => {
    const c = compareLaps(lap(200), lap(180), 10, 25)!;
    expect(c.miniSectors).toHaveLength(25);
    expect(c.miniSectors[0].from).toBe(0);
    expect(c.miniSectors.at(-1)!.to).toBe(c.distance.length - 1);
    expect(c.miniSectors.every((m) => m.gain > 0)).toBe(true);
    expect(c.miniSectors.reduce((sum, m) => sum + m.gain, 0)).toBeCloseTo(2, 2);
  });

  it("keeps on/off channels on/off and draws the track from driver A's positions", () => {
    const c = compareLaps(lap(200, { brakeFrom: 9 }), lap(200))!;
    expect(new Set(c.a.brake)).toEqual(new Set([0, 100]));
    expect(c.a.brake[0]).toBe(0);
    expect(c.a.brake.at(-1)).toBe(100);
    expect(c.a.throttle.at(-1)).toBe(0);
    expect(c.x).toHaveLength(c.distance.length);
    // Round the circle: starts at (1000, 0), a quarter of the way at (0, 1000).
    expect(c.x[0]).toBeCloseTo(1000, -1);
    const quarter = Math.round((c.distance.length - 1) / 4);
    expect(Math.abs(c.x[quarter])).toBeLessThan(40);
    expect(c.y[quarter]).toBeGreaterThan(990);
  });

  it("leaves the track out without position data, and gives up on a lap with almost no car data", () => {
    const noPositions = { ...lap(200), location: [] };
    expect(compareLaps(noPositions, lap(190))?.x).toEqual([]);
    expect(compareLaps({ ...lap(200), car: lap(200).car.slice(0, 5) }, lap(190))).toBeNull();
  });
});
