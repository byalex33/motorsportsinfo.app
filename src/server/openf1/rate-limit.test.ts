import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter, RateLimitQueueFull } from "./rate-limit";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));

describe("OpenF1 rate limiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-08T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  const limiter = (maxPerWindow = 25) => createRateLimiter({ minGapMs: 350, maxPerWindow, windowMs: 60_000 });

  /** Starts `n` calls together and records when each one's slot opens, in ms from now. */
  function startTogether(acquire: () => Promise<void>, n: number) {
    const t0 = Date.now();
    const started: number[] = [];
    const all = Promise.all(Array.from({ length: n }, () => acquire().then(() => started.push(Date.now() - t0))));
    return { started, all };
  }

  it("starts three parallel calls at least 350 ms apart", async () => {
    const l = limiter();
    const { started, all } = startTogether(() => l.acquire(), 3);
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([0]);
    await vi.advanceTimersByTimeAsync(349);
    expect(started).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1);
    expect(started).toEqual([0, 350]);
    await vi.advanceTimersByTimeAsync(350);
    await all;
    expect(started).toEqual([0, 350, 700]);
  });

  it("doesn't wait when the last call was long enough ago", async () => {
    const l = limiter();
    await l.acquire();
    await vi.advanceTimersByTimeAsync(1000);
    const { started, all } = startTogether(() => l.acquire(), 1);
    await vi.advanceTimersByTimeAsync(0);
    await all;
    expect(started).toEqual([0]);
  });

  it("starts no more than 25 calls in any rolling 60 s", async () => {
    const l = limiter();
    const { started, all } = startTogether(() => l.acquire(), 27);
    await vi.advanceTimersByTimeAsync(120_000);
    await all;
    expect(started.slice(0, 25)).toEqual(Array.from({ length: 25 }, (_, i) => i * 350));
    // The 26th waits for the 1st to leave the window, the 27th for the 2nd.
    expect(started[25]).toBe(60_000);
    expect(started[26]).toBe(60_350);
    for (let i = 25; i < started.length; i++) expect(started[i] - started[i - 25]).toBeGreaterThanOrEqual(60_000);
  });

  it("refuses a slot further away than the caller will wait, without booking it", async () => {
    const l = limiter(2);
    await l.acquire();
    const second = l.acquire();
    await expect(l.acquire(undefined, 20_000)).rejects.toBeInstanceOf(RateLimitQueueFull);
    await vi.advanceTimersByTimeAsync(350);
    await second;
    // The refused call booked nothing: the next slot is still 60 s after the first.
    const { started, all } = startTogether(() => l.acquire(), 1);
    await vi.advanceTimersByTimeAsync(60_000);
    await all;
    expect(started).toEqual([60_000 - 350]);
  });

  it("waits with the caller's sleep", async () => {
    const l = limiter();
    const sleep = vi.fn(async () => {});
    await l.acquire(sleep);
    await l.acquire(sleep);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(350);
  });
});

describe("openF1Get", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-08T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sends parallel OpenF1 requests through the shared queue, 350 ms apart", async () => {
    const t0 = Date.now();
    const sent: { url: string; at: number }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        sent.push({ url, at: Date.now() - t0 });
        return new Response("[]", { status: 200 });
      }),
    );
    const { openF1Get } = await import("./index");
    const all = Promise.all([openF1Get("laps?session_key=1"), openF1Get("drivers?session_key=1"), openF1Get("session_result?session_key=1")]);
    await vi.advanceTimersByTimeAsync(1000);
    await all;
    expect(sent.map((s) => s.at)).toEqual([0, 350, 700]);
    expect(sent[0].url).toBe("https://api.openf1.org/v1/laps?session_key=1");
  });
});
