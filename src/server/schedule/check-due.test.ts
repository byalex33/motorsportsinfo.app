import { describe, expect, it } from "vitest";
import { decideCheckDue } from "./check-due";
import { makeRound, makeSession, withContext } from "./test-utils";
import type { RoundWithContext } from "./types";

// Baku (UTC+4), Round 24–26 Sep 2026; Round opens 23 Sep 20:00 UTC.
const round = makeRound("f2-2026-baku", "baku", "2026-09-24", "2026-09-26");
const baku = withContext(round, [
  makeSession(round.id, "practice", "2026-09-24T06:00:00Z"),
  makeSession(round.id, "feature-race", "2026-09-26T07:00:00Z", { endsAt: "2026-09-26T08:05:00.000Z" }),
  makeSession(round.id, "cancelled-one", "2026-09-25T12:00:00Z", { status: "cancelled" }),
]);
const at = (iso: string) => new Date(iso);
/** A Series whose last check succeeded. */
const ok = (iso: string) => ({ lastCheckedAt: at(iso), lastSucceededAt: at(iso) });
/** A Series whose last check, at `checked`, failed. */
const failed = (checked: string, succeeded: string | null) => ({
  lastCheckedAt: at(checked),
  lastSucceededAt: succeeded ? at(succeeded) : null,
});

/** Runs the 5-minute cron from `from` to `to` and returns when checks were made. Checks before `failsUntil` fail. */
function simulate(opts: { rounds: RoundWithContext[]; lastSucceeded: string; from: string; to: string; failsUntil?: string }) {
  let state = ok(opts.lastSucceeded);
  const checks: string[] = [];
  for (let t = at(opts.from).getTime(); t <= at(opts.to).getTime(); t += 5 * 60_000) {
    const now = new Date(t);
    if (!decideCheckDue({ now, ...state, rounds: opts.rounds }).due) continue;
    checks.push(now.toISOString().slice(5, 16));
    const succeeds = !opts.failsUntil || t >= at(opts.failsUntil).getTime();
    state = { lastCheckedAt: now, lastSucceededAt: succeeds ? now : state.lastSucceededAt };
  }
  return checks;
}

describe("decideCheckDue", () => {
  it("is due when never checked", () => {
    expect(decideCheckDue({ now: at("2026-09-01T00:00:00Z"), lastCheckedAt: null, lastSucceededAt: null, rounds: [] })).toEqual({
      due: true,
      reason: "never-checked",
    });
  });

  it("is due at least once every 24 h", () => {
    const now = at("2026-09-10T12:00:00Z");
    expect(decideCheckDue({ now, ...ok("2026-09-09T12:00:01Z"), rounds: [baku] }).due).toBe(false);
    expect(decideCheckDue({ now, ...ok("2026-09-09T12:00:00Z"), rounds: [baku] })).toMatchObject({ reason: "daily" });
  });

  it("is due every 2 h while a Round is in progress, from 00:00 Track Time on its first day", () => {
    const before = at("2026-09-23T19:55:00Z"); // 23:55 in Baku, Round not open yet
    expect(decideCheckDue({ now: before, ...ok("2026-09-23T17:00:00Z"), rounds: [baku] }).due).toBe(false);
    const opened = at("2026-09-23T20:05:00Z");
    expect(decideCheckDue({ now: opened, ...ok("2026-09-23T18:00:00Z"), rounds: [baku] })).toMatchObject({
      reason: "round-in-progress",
    });
    expect(decideCheckDue({ now: opened, ...ok("2026-09-23T18:10:00Z"), rounds: [baku] }).due).toBe(false);
  });

  it("keeps the 2-hourly cadence until 2 h after the final Session ends, then stops", () => {
    expect(
      decideCheckDue({ now: at("2026-09-26T10:00:00Z"), ...ok("2026-09-26T08:00:00Z"), rounds: [baku] }),
    ).toMatchObject({ reason: "round-in-progress" });
    expect(
      decideCheckDue({ now: at("2026-09-26T10:10:00Z"), ...ok("2026-09-26T08:05:00Z"), rounds: [baku] }).due,
    ).toBe(false);
  });

  it("is due once in the 30 minutes before a Session starts", () => {
    const rounds = [baku];
    // Practice at 06:00Z; window opens 05:30Z. Last check 04:30Z (within 2 h, so no in-Round check).
    expect(decideCheckDue({ now: at("2026-09-24T05:29:00Z"), ...ok("2026-09-24T04:30:00Z"), rounds }).due).toBe(false);
    expect(decideCheckDue({ now: at("2026-09-24T05:30:00Z"), ...ok("2026-09-24T04:30:00Z"), rounds })).toEqual({
      due: true,
      reason: "pre-session",
      sessionId: "f2-2026-baku:practice",
    });
    // Already checked inside the window: not again.
    expect(decideCheckDue({ now: at("2026-09-24T05:50:00Z"), ...ok("2026-09-24T05:31:00Z"), rounds }).due).toBe(false);
    // Session started: window closed.
    expect(decideCheckDue({ now: at("2026-09-24T06:01:00Z"), ...ok("2026-09-24T04:30:00Z"), rounds }).due).toBe(false);
  });

  it("ignores cancelled Sessions for the pre-session check", () => {
    expect(
      decideCheckDue({ now: at("2026-09-25T11:45:00Z"), ...ok("2026-09-25T10:30:00Z"), rounds: [baku] }).due,
    ).toBe(false);
  });

  it("confirms a pending change 10 minutes later instead of at the next 2-hourly check", () => {
    // Singapore 2026: Qualifying moved 13:00 → 13:30 UTC. The pre-session check at 12:30 sees it once;
    // without this rule the next check would be ~14:30, after the old and new start times.
    const r = makeRound("f1-2026-marina-bay", "marina-bay", "2026-10-09", "2026-10-11");
    const sg = withContext(r, [makeSession(r.id, "qualifying", "2026-10-10T13:00:00Z")]);
    const input = { ...ok("2026-10-10T12:30:00Z"), rounds: [sg], hasPendingChanges: true };
    expect(decideCheckDue({ ...input, now: at("2026-10-10T12:35:00Z") }).due).toBe(false);
    expect(decideCheckDue({ ...input, now: at("2026-10-10T12:40:00Z") })).toEqual({ due: true, reason: "confirm-change" });
    expect(decideCheckDue({ ...input, hasPendingChanges: false, now: at("2026-10-10T12:40:00Z") }).due).toBe(false);
  });

  it("checks a healthy Series outside a Round only daily", () => {
    const checks = simulate({
      rounds: [baku],
      lastSucceeded: "2026-09-08T12:00:00Z",
      from: "2026-09-08T12:05:00Z",
      to: "2026-09-11T11:55:00Z",
    });
    expect(checks).toEqual(["09-09T12:00", "09-10T12:00"]);
  });

  it("retries a failed check outside a Round after 10 min, then 30 min, then hourly", () => {
    // The daily check at 12:00 fails; before, the next attempt was 24 h later.
    const input = { ...failed("2026-09-10T12:00:00Z", "2026-09-09T12:00:00Z"), rounds: [baku] };
    expect(decideCheckDue({ ...input, now: at("2026-09-10T12:05:00Z") }).due).toBe(false); // or still running
    expect(decideCheckDue({ ...input, now: at("2026-09-10T12:10:00Z") })).toEqual({ due: true, reason: "retry-after-failure" });

    const checks = simulate({
      rounds: [baku],
      lastSucceeded: "2026-09-09T12:00:00Z",
      from: "2026-09-10T11:55:00Z",
      to: "2026-09-10T16:00:00Z",
      failsUntil: "2026-09-11T00:00:00Z",
    });
    expect(checks).toEqual(["09-10T12:00", "09-10T12:10", "09-10T12:40", "09-10T13:40", "09-10T14:40", "09-10T15:40"]);
  });

  it("returns to the daily check once a retry succeeds", () => {
    const checks = simulate({
      rounds: [baku],
      lastSucceeded: "2026-09-09T12:00:00Z",
      from: "2026-09-10T11:55:00Z",
      to: "2026-09-11T13:00:00Z",
      failsUntil: "2026-09-10T12:30:00Z",
    });
    expect(checks).toEqual(["09-10T12:00", "09-10T12:10", "09-10T12:40", "09-11T12:40"]);
  });

  it("measures the daily check from the last success, so a failed check never pushes it later", () => {
    // A forced check at 06:00 failed; the daily check is still due at 12:00, 24 h after the last success.
    const input = { ...failed("2026-09-10T06:00:00Z", "2026-09-09T12:00:00Z"), rounds: [baku] };
    expect(decideCheckDue({ ...input, now: at("2026-09-10T11:55:00Z") }).due).toBe(false);
    expect(decideCheckDue({ ...input, now: at("2026-09-10T12:00:00Z") })).toEqual({ due: true, reason: "daily" });
  });

  it("retries a failed pre-session check inside the window", () => {
    // Practice at 06:00Z; the pre-session check at 05:30 fails. Before, it was not retried before the Session.
    const rounds = [baku];
    const input = { ...failed("2026-09-24T05:30:00Z", "2026-09-24T04:30:00Z"), rounds };
    expect(decideCheckDue({ ...input, now: at("2026-09-24T05:35:00Z") }).due).toBe(false);
    expect(decideCheckDue({ ...input, now: at("2026-09-24T05:40:00Z") })).toEqual({ due: true, reason: "retry-after-failure" });

    // Still failing: the next check is the in-Round one, 2 h after the last success.
    const checks = simulate({
      rounds,
      lastSucceeded: "2026-09-24T04:30:00Z",
      from: "2026-09-24T04:35:00Z",
      to: "2026-09-24T06:30:00Z",
      failsUntil: "2026-09-25T00:00:00Z",
    });
    expect(checks).toEqual(["09-24T05:30", "09-24T05:40", "09-24T06:30"]);
  });

  it("gives a pre-session window opening during an outage a fresh attempt instead of waiting for the hourly retry", () => {
    // Failing since the daily check on 22 Sep, retried hourly; the last retry was 05:10.
    const input = { ...failed("2026-09-24T05:10:00Z", "2026-09-22T12:00:00Z"), rounds: [baku] };
    expect(decideCheckDue({ ...input, now: at("2026-09-24T05:25:00Z") }).due).toBe(false);
    expect(decideCheckDue({ ...input, now: at("2026-09-24T05:30:00Z") })).toEqual({
      due: true,
      reason: "pre-session",
      sessionId: "f2-2026-baku:practice",
    });
  });

  it("retries a Series that has never succeeded hourly", () => {
    const input = { ...failed("2026-09-10T12:00:00Z", null), rounds: [] };
    expect(decideCheckDue({ ...input, now: at("2026-09-10T12:55:00Z") }).due).toBe(false);
    expect(decideCheckDue({ ...input, now: at("2026-09-10T13:00:00Z") })).toEqual({ due: true, reason: "retry-after-failure" });
  });
});
