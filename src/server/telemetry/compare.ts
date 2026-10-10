// Lines two laps up by distance. OpenF1 gives car data and position against time, not distance, so each
// lap's distance is integrated from its speed, both are stretched to a common lap length (integration drifts
// by a few metres), and every channel is resampled onto one evenly spaced distance grid.
import type { LapComparison, LapTrace, MiniSector } from "@/domain/types";
import type { OpenF1CarData, OpenF1Location } from "./openf1";

export interface LapInput {
  lap: number;
  /** Seconds. */
  time: number;
  /** ISO 8601 UTC. */
  startsAt: string;
  car: OpenF1CarData[];
  location: OpenF1Location[];
}

interface Sample {
  /** Seconds since the lap started. */
  t: number;
  /** Metres since the lap started, before stretching to the common length. */
  d: number;
  speed: number;
  throttle: number;
  brake: number;
  gear: number;
}

/** Fewer samples than this (about 5 s of a ~4 Hz feed) is a broken download, not a lap. */
const MIN_SAMPLES = 20;

/**
 * Two laps on one distance grid (`step` metres apart), with the running gap and `miniSectorCount` equal
 * stretches. Null when either lap has too little car data to compare.
 */
export function compareLaps(a: LapInput, b: LapInput, step = 10, miniSectorCount = 25): LapComparison | null {
  const sa = samples(a);
  const sb = samples(b);
  if (!sa || !sb) return null;

  const length = (sa.at(-1)!.d + sb.at(-1)!.d) / 2;
  const n = Math.max(2, Math.round(length / step));
  const distance = Array.from({ length: n + 1 }, (_, i) => (i * length) / n);

  const ta = stretch(sa, length);
  const tb = stretch(sb, length);
  const timeA = distance.map((d) => timeAt(ta, d));
  const timeB = distance.map((d) => timeAt(tb, d));

  const miniSectors: MiniSector[] = [];
  for (let k = 0; k < miniSectorCount; k++) {
    const from = Math.round((k * n) / miniSectorCount);
    const to = Math.round(((k + 1) * n) / miniSectorCount);
    miniSectors.push({ from, to, gain: round3(timeB[to] - timeB[from] - (timeA[to] - timeA[from])) });
  }

  const startA = Date.parse(a.startsAt);
  const path = a.location
    .map((p) => ({ t: (Date.parse(p.date) - startA) / 1000, x: p.x, y: p.y }))
    .filter((p) => p.t >= -1 && p.t <= a.time + 1)
    .sort((p, q) => p.t - q.t);
  const hasPath = path.length >= MIN_SAMPLES;

  return {
    distance: distance.map(Math.round),
    a: trace(a, ta, distance),
    b: trace(b, tb, distance),
    delta: distance.map((_, i) => round3(timeB[i] - timeA[i])),
    x: hasPath ? timeA.map((t) => Math.round(lerpAt(path, t, "x"))) : [],
    y: hasPath ? timeA.map((t) => Math.round(lerpAt(path, t, "y"))) : [],
    miniSectors,
  };
}

/** The lap's car data in time order, with distance integrated from speed, bracketed by the lap's start and end. */
function samples(lap: LapInput): Sample[] | null {
  const start = Date.parse(lap.startsAt);
  const raw = lap.car
    .map((c) => ({
      t: (Date.parse(c.date) - start) / 1000,
      speed: Math.max(0, c.speed),
      throttle: Math.min(100, Math.max(0, c.throttle)),
      brake: c.brake > 0 ? 100 : 0,
      gear: c.n_gear,
    }))
    .filter((s) => s.t > 0 && s.t < lap.time)
    .sort((p, q) => p.t - q.t);
  if (raw.length < MIN_SAMPLES) return null;

  // The lap starts and ends at the line, between samples: carry the nearest sample's values out to each end.
  const first = raw[0];
  const last = raw.at(-1)!;
  const points = [{ ...first, t: 0 }, ...raw, { ...last, t: lap.time }];
  const out: Sample[] = [];
  let d = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) d += ((points[i - 1].speed + points[i].speed) / 2 / 3.6) * (points[i].t - points[i - 1].t);
    out.push({ ...points[i], d });
  }
  return out;
}

/** The samples with distances scaled so the lap is exactly `length` metres long. */
function stretch(s: Sample[], length: number): Sample[] {
  const k = length / s.at(-1)!.d;
  return s.map((p) => ({ ...p, d: p.d * k }));
}

function trace(lap: LapInput, s: Sample[], distance: number[]): LapTrace {
  let j = 0;
  const speed: number[] = [];
  const throttle: number[] = [];
  const brake: number[] = [];
  const gear: number[] = [];
  for (const d of distance) {
    while (j < s.length - 2 && s[j + 1].d < d) j++;
    const p = s[j];
    const q = s[j + 1];
    const f = q.d > p.d ? Math.min(1, Math.max(0, (d - p.d) / (q.d - p.d))) : 0;
    speed.push(Math.round(p.speed + (q.speed - p.speed) * f));
    throttle.push(Math.round(p.throttle + (q.throttle - p.throttle) * f));
    // On/off and whole-number channels hold their last value rather than blending between samples.
    brake.push(f < 1 ? p.brake : q.brake);
    gear.push(f < 1 ? p.gear : q.gear);
  }
  return { lap: lap.lap, time: lap.time, speed, throttle, brake, gear };
}

/** Seconds into the lap at distance `d` (distance only grows, so this inverts it). */
function timeAt(s: Sample[], d: number): number {
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid].d <= d) lo = mid;
    else hi = mid;
  }
  const p = s[lo];
  const q = s[hi];
  if (q.d <= p.d) return p.t;
  return p.t + ((q.t - p.t) * (d - p.d)) / (q.d - p.d);
}

function lerpAt(path: { t: number; x: number; y: number }[], t: number, key: "x" | "y"): number {
  if (t <= path[0].t) return path[0][key];
  if (t >= path.at(-1)!.t) return path.at(-1)![key];
  let lo = 0;
  let hi = path.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const p = path[lo];
  const q = path[hi];
  return p[key] + ((q[key] - p[key]) * (t - p.t)) / (q.t - p.t || 1);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
