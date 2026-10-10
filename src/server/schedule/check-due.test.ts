import { describe, expect, it } from "vitest";
import { decideCheckDue } from "./check-due";
import { makeRound, makeSession, withContext } from "./test-utils";

// Baku (UTC+4), Round 24–26 Sep 2026; Round opens 23 Sep 20:00 UTC.
const round = makeRound("f2-2026-baku", "baku", "2026-09-24", "2026-09-26");
const baku = withContext(round, [
  makeSession(round.id, "practice", "2026-09-24T06:00:00Z"),
  makeSession(round.id, "feature-race", "2026-09-26T07:00:00Z", { endsAt: "2026-09-26T08:05:00.000Z" }),
  makeSession(round.id, "cancelled-one", "2026-09-25T12:00:00Z", { status: "cancelled" }),
]);
const at = (iso: string) => new Date(iso);

describe("decideCheckDue", () => {
  it("is due when never checked", () => {
    expect(decideCheckDue({ now: at("2026-09-01T00:00:00Z"), lastCheckedAt: null, rounds: [] })).toEqual({
      due: true,
      reason: "never-checked",
    });
  });

  it("is due at least once every 24 h", () => {
    const now = at("2026-09-10T12:00:00Z");
    expect(decideCheckDue({ now, lastCheckedAt: at("2026-09-09T12:00:01Z"), rounds: [baku] }).due).toBe(false);
    expect(decideCheckDue({ now, lastCheckedAt: at("2026-09-09T12:00:00Z"), rounds: [baku] })).toMatchObject({ reason: "daily" });
  });

  it("is due every 2 h while a Round is in progress, from 00:00 Track Time on its first day", () => {
    const before = at("2026-09-23T19:55:00Z"); // 23:55 in Baku, Round not open yet
    expect(decideCheckDue({ now: before, lastCheckedAt: at("2026-09-23T17:00:00Z"), rounds: [baku] }).due).toBe(false);
    const opened = at("2026-09-23T20:05:00Z");
    expect(decideCheckDue({ now: opened, lastCheckedAt: at("2026-09-23T18:00:00Z"), rounds: [baku] })).toMatchObject({
      reason: "round-in-progress",
    });
    expect(decideCheckDue({ now: opened, lastCheckedAt: at("2026-09-23T18:10:00Z"), rounds: [baku] }).due).toBe(false);
  });

  it("keeps the 2-hourly cadence until 2 h after the final Session ends, then stops", () => {
    expect(
      decideCheckDue({ now: at("2026-09-26T10:00:00Z"), lastCheckedAt: at("2026-09-26T08:00:00Z"), rounds: [baku] }),
    ).toMatchObject({ reason: "round-in-progress" });
    expect(
      decideCheckDue({ now: at("2026-09-26T10:10:00Z"), lastCheckedAt: at("2026-09-26T08:05:00Z"), rounds: [baku] }).due,
    ).toBe(false);
  });

  it("is due once in the 30 minutes before a Session starts", () => {
    const rounds = [baku];
    // Practice at 06:00Z; window opens 05:30Z. Last check 04:30Z (within 2 h, so no in-Round check).
    expect(decideCheckDue({ now: at("2026-09-24T05:29:00Z"), lastCheckedAt: at("2026-09-24T04:30:00Z"), rounds }).due).toBe(false);
    expect(decideCheckDue({ now: at("2026-09-24T05:30:00Z"), lastCheckedAt: at("2026-09-24T04:30:00Z"), rounds })).toEqual({
      due: true,
      reason: "pre-session",
      sessionId: "f2-2026-baku:practice",
    });
    // Already checked inside the window: not again.
    expect(decideCheckDue({ now: at("2026-09-24T05:50:00Z"), lastCheckedAt: at("2026-09-24T05:31:00Z"), rounds }).due).toBe(false);
    // Session started: window closed.
    expect(decideCheckDue({ now: at("2026-09-24T06:01:00Z"), lastCheckedAt: at("2026-09-24T04:30:00Z"), rounds }).due).toBe(false);
  });

  it("ignores cancelled Sessions for the pre-session check", () => {
    expect(
      decideCheckDue({ now: at("2026-09-25T11:45:00Z"), lastCheckedAt: at("2026-09-25T10:30:00Z"), rounds: [baku] }).due,
    ).toBe(false);
  });

  it("confirms a pending change 10 minutes later instead of at the next 2-hourly check", () => {
    // Singapore 2026: Qualifying moved 13:00 → 13:30 UTC. The pre-session check at 12:30 sees it once;
    // without this rule the next check would be ~14:30, after the old and new start times.
    const r = makeRound("f1-2026-marina-bay", "marina-bay", "2026-10-09", "2026-10-11");
    const sg = withContext(r, [makeSession(r.id, "qualifying", "2026-10-10T13:00:00Z")]);
    const lastCheckedAt = at("2026-10-10T12:30:00Z");
    const input = { lastCheckedAt, rounds: [sg], hasPendingChanges: true };
    expect(decideCheckDue({ ...input, now: at("2026-10-10T12:35:00Z") }).due).toBe(false);
    expect(decideCheckDue({ ...input, now: at("2026-10-10T12:40:00Z") })).toEqual({ due: true, reason: "confirm-change" });
    expect(decideCheckDue({ ...input, hasPendingChanges: false, now: at("2026-10-10T12:40:00Z") }).due).toBe(false);
  });
});
