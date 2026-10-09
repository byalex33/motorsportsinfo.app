import { describe, expect, it } from "vitest";
import { classifyPushError, mapWithConcurrency } from "./push";

describe("classifyPushError", () => {
  it("treats 404 and 410 as a subscription that is gone for good", () => {
    expect(classifyPushError({ statusCode: 404 })).toBe("gone");
    expect(classifyPushError({ statusCode: 410 })).toBe("gone");
  });
  it("treats everything else as a temporary failure", () => {
    expect(classifyPushError({ statusCode: 429 })).toBe("failed");
    expect(classifyPushError({ statusCode: 500 })).toBe("failed");
    expect(classifyPushError(new Error("socket hang up"))).toBe("failed");
    expect(classifyPushError(undefined)).toBe("failed");
  });
});

describe("mapWithConcurrency", () => {
  it("keeps order and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([5, 1, 4, 2, 3, 0, 6], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, n));
      inFlight--;
      return n * 10;
    });
    expect(results).toEqual([50, 10, 40, 20, 30, 0, 60]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 10, async () => 1)).toEqual([]);
  });
});
