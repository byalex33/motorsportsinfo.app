import { describe, expect, it } from "vitest";
import { SERIES_IDS } from "@/domain/types";
import type { SyncStatus } from "@/server/status";
import { isDailyRunHour, isOwnerAlertDue, noteDailyRunDone, ownerAlertPayload, utcDay } from "./owner";

const NOW = "2026-10-15T07:00:00.000Z";

function status(failing: string[], flags: { series: string; message: string }[] = []): SyncStatus {
  const series = SERIES_IDS.map((id) => ({
    series: id,
    ok: !failing.includes(id),
    lastCheckedAt: null,
    lastSucceededAt: null,
    lastSource: null,
    lastError: null,
  }));
  const openFlags = flags.map((f, i) => ({
    id: i + 1,
    series: f.series as SyncStatus["openFlags"][number]["series"],
    sessionId: null,
    message: f.message,
    createdAt: NOW,
  }));
  return { ok: failing.length === 0 && flags.length === 0, now: NOW, openFlags, series };
}

describe("isDailyRunHour", () => {
  it("is true for every run in the 07:00 UTC hour, so a late or failed 07:00 run is made up", () => {
    expect(isDailyRunHour(new Date("2026-10-15T07:00:00Z"))).toBe(true);
    expect(isDailyRunHour(new Date("2026-10-15T07:03:00Z"))).toBe(true);
    expect(isDailyRunHour(new Date("2026-10-15T07:59:59Z"))).toBe(true);
    expect(isDailyRunHour(new Date("2026-10-15T08:00:00Z"))).toBe(false);
    expect(isDailyRunHour(new Date("2026-10-15T06:59:00Z"))).toBe(false);
    expect(isDailyRunHour(new Date("2026-10-15T19:00:00Z"))).toBe(false);
  });

  it("goes by UTC, not the server's time zone", () => {
    // 07:00 in Paris is 05:00 UTC; 09:00 in Paris is 07:00 UTC.
    expect(isDailyRunHour(new Date("2026-10-15T07:00:00+02:00"))).toBe(false);
    expect(isDailyRunHour(new Date("2026-10-15T09:00:00+02:00"))).toBe(true);
  });
});

describe("utcDay", () => {
  it("is the UTC date", () => {
    expect(utcDay(new Date("2026-10-15T07:03:00Z"))).toBe("2026-10-15");
    expect(utcDay(new Date("2026-10-16T01:00:00+02:00"))).toBe("2026-10-15");
  });
});

describe("isOwnerAlertDue", () => {
  it("stops being due once this instance has done today's daily run, and is due again the next day", () => {
    expect(isOwnerAlertDue(new Date("2026-10-15T07:01:00Z"))).toBe(true);
    noteDailyRunDone(new Date("2026-10-15T07:01:00Z"));
    expect(isOwnerAlertDue(new Date("2026-10-15T07:02:00Z"))).toBe(false);
    expect(isOwnerAlertDue(new Date("2026-10-16T07:00:00Z"))).toBe(true);
    expect(isOwnerAlertDue(new Date("2026-10-16T08:00:00Z"))).toBe(false);
  });
});

describe("ownerAlertPayload", () => {
  it("says nothing when the sync is healthy", () => {
    expect(ownerAlertPayload(status([]))).toBeNull();
  });

  it("names the Series not synced lately and opens the first one's page", () => {
    expect(ownerAlertPayload(status(["nascar", "wrc"]))).toEqual({
      title: "Schedule sync needs attention",
      body: "Not synced in 26 h: WRC, NASCAR",
      url: "/wrc",
      tag: "owner:sync-status",
    });
  });

  it("quotes the first open Schedule Flag and counts the rest", () => {
    const payload = ownerAlertPayload(
      status([], [
        { series: "f1", message: "Race moved by more than 24 hours" },
        { series: "wec", message: "Session missing" },
      ]),
    );
    expect(payload?.body).toBe("Flag: F1 · Race moved by more than 24 hours (+1 more)");
    expect(payload?.url).toBe("/f1");
  });

  it("puts both on separate lines and shortens a long flag message", () => {
    const payload = ownerAlertPayload(status(["nascar"], [{ series: "f1", message: "x".repeat(500) }]));
    const [synced, flag] = payload?.body.split("\n") ?? [];
    expect(synced).toBe("Not synced in 26 h: NASCAR");
    expect(flag.startsWith("Flag: F1 · xxx")).toBe(true);
    expect(flag.endsWith("…")).toBe(true);
    expect(flag.length).toBeLessThan(200);
  });
});
