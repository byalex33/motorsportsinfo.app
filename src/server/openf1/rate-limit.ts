// One request queue for every OpenF1 call in this instance: the schedule source, Session Results and
// Telemetry. OpenF1's free tier allows 3 requests a second and 30 a minute, and a 429 leaves a page's
// Session Results or Telemetry "pending" for up to 15 minutes, so parallel renders must not burst. Each
// instance has its own queue; the limits leave room for a few instances at once.

/** Each OpenF1 request starts at least this long after the one before. */
export const OPENF1_MIN_GAP_MS = 350;
/** At most this many OpenF1 requests start in any rolling window. */
export const OPENF1_MAX_PER_WINDOW = 25;
export const OPENF1_WINDOW_MS = 60_000;

export interface RateLimiterOptions {
  minGapMs: number;
  maxPerWindow: number;
  windowMs: number;
  now?: () => number;
}

export type Sleep = (ms: number) => Promise<void>;

/** Thrown instead of waiting longer than the caller allows; no slot is booked. */
export class RateLimitQueueFull extends Error {
  constructor(readonly waitMs: number) {
    super(`OpenF1 request queue full: next slot in ${Math.ceil(waitMs / 1000)} s`);
  }
}

const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A queue of request start times. `acquire` books the next free slot synchronously, so callers that
 * arrive together get slots in arrival order, then waits until it starts. `sleep` is the caller's (the
 * schedule source passes its context's, a no-op in tests); the slot is booked either way. When the slot
 * is more than `maxWaitMs` away it throws RateLimitQueueFull instead, without booking it.
 */
export function createRateLimiter({ minGapMs, maxPerWindow, windowMs, now = Date.now }: RateLimiterOptions) {
  /** Booked start times, oldest first; only the last `maxPerWindow` matter. */
  const starts: number[] = [];

  return {
    async acquire(sleep: Sleep = realSleep, maxWaitMs = Number.POSITIVE_INFINITY): Promise<void> {
      const t = now();
      let start = t;
      if (starts.length > 0) start = Math.max(start, starts[starts.length - 1] + minGapMs);
      if (starts.length >= maxPerWindow) start = Math.max(start, starts[starts.length - maxPerWindow] + windowMs);
      if (start - t > maxWaitMs) throw new RateLimitQueueFull(start - t);
      starts.push(start);
      if (starts.length > maxPerWindow) starts.splice(0, starts.length - maxPerWindow);
      if (start > t) await sleep(start - t);
    },
  };
}

const openF1Limiter = createRateLimiter({
  minGapMs: OPENF1_MIN_GAP_MS,
  maxPerWindow: OPENF1_MAX_PER_WINDOW,
  windowMs: OPENF1_WINDOW_MS,
});

/**
 * Waits for this instance's next OpenF1 request slot. Call it right before every OpenF1 request. With
 * `maxWaitMs` it throws RateLimitQueueFull rather than wait longer (a "use cache" fill during a build
 * times out after 50 s).
 */
export function openF1Slot(sleep?: Sleep, maxWaitMs?: number): Promise<void> {
  return openF1Limiter.acquire(sleep, maxWaitMs);
}
