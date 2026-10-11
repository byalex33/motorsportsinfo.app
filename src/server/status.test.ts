import { describe, expect, it } from "vitest";
import { SERIES_IDS } from "@/domain/types";
import { summariseSyncStatus } from "./status";

const NOW = new Date("2026-10-11T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

/** A healthy source_checks row for every Series, checked and succeeded `h` hours ago. */
const healthy = (h = 1) =>
  SERIES_IDS.map((series) => ({
    series,
    lastCheckedAt: hoursAgo(h),
    lastSucceededAt: hoursAgo(h),
    lastSource: "openf1",
    lastError: null,
  }));

describe("summariseSyncStatus", () => {
  it("is ok when every Series succeeded recently and no Schedule Flag is open", () => {
    const status = summariseSyncStatus({ now: NOW, flags: [], checks: healthy(24) });
    expect(status.ok).toBe(true);
    expect(status.series).toHaveLength(SERIES_IDS.length);
    expect(status.series.every((s) => s.ok)).toBe(true);
    expect(status.series[0].lastSucceededAt).toBe("2026-10-10T12:00:00.000Z");
  });

  it("is not ok while a Schedule Flag is open, and lists it", () => {
    const flag = { id: 7, series: "f2" as const, sessionId: null, message: "Unknown Circuit: Lusail", createdAt: hoursAgo(3) };
    const status = summariseSyncStatus({ now: NOW, flags: [flag], checks: healthy() });
    expect(status.ok).toBe(false);
    expect(status.openFlags).toEqual([{ ...flag, createdAt: "2026-10-11T09:00:00.000Z" }]);
  });

  it("is not ok when a Series has not succeeded within 26 hours, keeping its last error", () => {
    const checks = healthy().map((c) =>
      c.series === "wec" ? { ...c, lastCheckedAt: hoursAgo(1), lastSucceededAt: hoursAgo(27), lastError: "HTTP 500" } : c,
    );
    const status = summariseSyncStatus({ now: NOW, flags: [], checks });
    expect(status.ok).toBe(false);
    expect(status.series.find((s) => s.series === "wec")).toMatchObject({ ok: false, lastError: "HTTP 500" });
    expect(status.series.filter((s) => !s.ok)).toHaveLength(1);
  });

  it("treats a Series that was never checked, or never succeeded, as not ok", () => {
    const checks = healthy()
      .filter((c) => c.series !== "motogp")
      .map((c) => (c.series === "fe" ? { ...c, lastSucceededAt: null } : c));
    const status = summariseSyncStatus({ now: NOW, flags: [], checks });
    expect(status.ok).toBe(false);
    expect(status.series.find((s) => s.series === "motogp")).toMatchObject({ ok: false, lastCheckedAt: null });
    expect(status.series.find((s) => s.series === "fe")?.ok).toBe(false);
  });
});
