import { describe, expect, it } from "vitest";
import type { Session } from "@/domain/types";
import { countdownParts, formatCountdown, getRoundStatus, isRadarWindow, sessionPhase } from "./round-status";

function session(id: string, startsAt: string, endsAt: string, status: Session["status"] = "scheduled"): Session {
  return {
    id: `r:${id}`,
    roundId: "r",
    series: "f1",
    type: "practice",
    name: id,
    startsAt,
    endsAt,
    endIsEstimated: false,
    status,
  };
}

const fp1 = session("fp1", "2026-11-20T00:30:00Z", "2026-11-20T01:30:00Z");
const fp2 = session("fp2", "2026-11-20T04:00:00Z", "2026-11-20T05:00:00Z");
const quali = session("quali", "2026-11-21T04:00:00Z", "2026-11-21T05:00:00Z");
const t = (iso: string) => Date.parse(iso);

describe("getRoundStatus", () => {
  it("counts towards the first Session before the Round starts", () => {
    expect(getRoundStatus([fp1, fp2, quali], t("2026-11-01T00:00:00Z"))).toEqual({ kind: "upcoming", session: fp1 });
  });

  it("reports a running Session as live", () => {
    expect(getRoundStatus([fp1, fp2], t("2026-11-20T01:00:00Z"))).toEqual({ kind: "live", session: fp1 });
  });

  it("treats the start instant as live and the end instant as over", () => {
    expect(getRoundStatus([fp1, fp2], t(fp1.startsAt)).kind).toBe("live");
    expect(getRoundStatus([fp1, fp2], t(fp1.endsAt))).toEqual({ kind: "upcoming", session: fp2 });
  });

  it("skips cancelled Sessions", () => {
    const cancelled = { ...fp2, status: "cancelled" as const };
    expect(getRoundStatus([fp1, cancelled, quali], t("2026-11-20T02:00:00Z"))).toEqual({ kind: "upcoming", session: quali });
    expect(getRoundStatus([cancelled], t("2026-11-20T04:30:00Z"))).toEqual({ kind: "finished" });
  });

  it("does not depend on input order", () => {
    expect(getRoundStatus([quali, fp2, fp1], t("2026-11-19T00:00:00Z"))).toEqual({ kind: "upcoming", session: fp1 });
  });

  it("is finished after the last Session", () => {
    expect(getRoundStatus([fp1, fp2, quali], t("2026-11-22T00:00:00Z"))).toEqual({ kind: "finished" });
  });
});

describe("sessionPhase", () => {
  it("keeps cancelled Sessions cancelled", () => {
    expect(sessionPhase({ ...fp1, status: "cancelled" }, t("2026-11-20T01:00:00Z"))).toBe("cancelled");
  });
  it("classifies upcoming, live and finished", () => {
    expect(sessionPhase(fp1, t("2026-11-20T00:00:00Z"))).toBe("upcoming");
    expect(sessionPhase(fp1, t("2026-11-20T01:00:00Z"))).toBe("live");
    expect(sessionPhase(fp1, t("2026-11-20T02:00:00Z"))).toBe("finished");
  });
});

describe("countdown", () => {
  it("splits the remaining time", () => {
    const parts = countdownParts("2026-11-20T00:30:00Z", t("2026-11-18T22:25:10Z"));
    expect(parts).toMatchObject({ days: 1, hours: 2, minutes: 4, seconds: 50 });
  });
  it("never goes negative", () => {
    expect(countdownParts("2026-11-20T00:30:00Z", t("2026-11-21T00:00:00Z"))).toMatchObject({ days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 });
  });
  it("formats compactly", () => {
    expect(formatCountdown({ days: 2, hours: 4, minutes: 5, seconds: 9, totalMs: 1 })).toBe("2d 4h 05m");
    expect(formatCountdown({ days: 0, hours: 4, minutes: 5, seconds: 9, totalMs: 1 })).toBe("4h 05m");
    expect(formatCountdown({ days: 0, hours: 0, minutes: 12, seconds: 9, totalMs: 1 })).toBe("12m 09s");
  });
});

describe("isRadarWindow", () => {
  it("opens an hour before a Session and closes at its end", () => {
    expect(isRadarWindow([fp1], t("2026-11-19T23:29:00Z"))).toBe(false);
    expect(isRadarWindow([fp1], t("2026-11-19T23:30:00Z"))).toBe(true);
    expect(isRadarWindow([fp1], t("2026-11-20T01:29:00Z"))).toBe(true);
    expect(isRadarWindow([fp1], t("2026-11-20T01:30:00Z"))).toBe(false);
  });
  it("ignores cancelled Sessions", () => {
    expect(isRadarWindow([{ ...fp1, status: "cancelled" }], t("2026-11-20T01:00:00Z"))).toBe(false);
  });
});
