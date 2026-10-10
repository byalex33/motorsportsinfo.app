import { describe, expect, it } from "vitest";
import { formatLapTime } from "./lap-time";

describe("formatLapTime", () => {
  it("formats laps and race times without float drift", () => {
    expect(formatLapTime(92.274)).toBe("1:32.274");
    expect(formatLapTime(59.9996)).toBe("1:00.000");
    expect(formatLapTime(6434.808)).toBe("1:47:14.808");
    expect(formatLapTime(3600)).toBe("1:00:00.000");
  });
});
