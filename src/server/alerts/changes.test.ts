import { describe, expect, it } from "vitest";
import { coalesceChanges, planChangePushes, type ScheduleChangeRow } from "./changes";
import type { AlertSession, AlertSubscription } from "./types";

const now = new Date("2026-11-20T12:00:00Z");
const previous = new Date("2026-11-21T13:15:00Z");
const moved = new Date("2026-11-21T14:00:00Z");

function sub(id: string, follows: AlertSubscription["follows"], timeZone = "UTC"): AlertSubscription {
  return { id, endpoint: `https://push.example/${id}`, p256dh: "p", auth: "a", leadMinutes: 15, follows, documentAlerts: {}, timeZone, failureCount: 0 };
}

const quali: AlertSession = {
  id: "f1-2026-x:qualifying",
  series: "f1",
  type: "qualifying",
  name: "Qualifying",
  startsAt: moved,
  status: "scheduled",
  roundName: "Las Vegas Grand Prix",
  timesConfirmed: true,
};
const sprintRace: AlertSession = {
  id: "f2-2026-x:sprint-race",
  series: "f2",
  type: "sprint-race",
  name: "Sprint Race",
  startsAt: previous,
  status: "cancelled",
  roundName: "Round 12",
  timesConfirmed: true,
};
const sessions = new Map([
  [quali.id, quali],
  [sprintRace.id, sprintRace],
]);

function change(overrides: Partial<ScheduleChangeRow> & Pick<ScheduleChangeRow, "id">): ScheduleChangeRow {
  return { sessionId: quali.id, series: "f1", kind: "time", previousStartsAt: previous, newStartsAt: moved, ...overrides };
}

describe("planChangePushes targeting", () => {
  const subs = [
    sub("follows-f1-quali", { f1: ["qualifying"] }),
    sub("follows-f1-race-only", { f1: ["race"] }),
    sub("follows-f2-sprint", { f2: ["sprint-race"] }),
    sub("follows-f3-sprint", { f3: ["sprint-race"] }),
    sub("follows-both", { f1: ["qualifying", "race"], f2: ["sprint-race"] }),
  ];

  it("pushes a time change only to subscriptions following that Series and Session Type", () => {
    const plan = planChangePushes([change({ id: 1 })], sessions, subs, now);
    expect(plan.changeIds).toEqual([1]);
    expect(plan.pushes.map((p) => p.subscription.id)).toEqual(["follows-f1-quali", "follows-both"]);
    expect(plan.pushes[0].payload).toEqual({
      title: "F1 Qualifying moved",
      body: "Las Vegas Grand Prix · now starts Sat 14:00 (was 13:15)",
      url: "/f1",
      tag: "session:f1-2026-x:qualifying",
    });
  });

  it("pushes a cancellation to followers of that Series' Session Type, not the same type in another Series", () => {
    const row = change({ id: 2, sessionId: sprintRace.id, series: "f2", kind: "cancelled", newStartsAt: null });
    const plan = planChangePushes([row], sessions, subs, now);
    expect(plan.pushes.map((p) => p.subscription.id)).toEqual(["follows-f2-sprint", "follows-both"]);
    expect(plan.pushes[0].payload.title).toBe("F2 Sprint Race cancelled");
    expect(plan.pushes[0].payload.body).toBe("Round 12 · was due Sat 13:15");
  });

  it("formats times in each subscriber's zone, with the weekday when the day changed", () => {
    const tokyo = sub("tokyo", { f1: ["qualifying"] }, "Asia/Tokyo");
    const plan = planChangePushes(
      [change({ id: 3, previousStartsAt: new Date("2026-11-21T14:30:00Z"), newStartsAt: new Date("2026-11-21T15:30:00Z") })],
      sessions,
      [tokyo],
      now,
    );
    // 14:30Z = Sat 23:30 JST, 15:30Z = Sun 00:30 JST
    expect(plan.pushes[0].payload.body).toBe("Las Vegas Grand Prix · now starts Sun 00:30 (was Sat 23:30)");
  });

  it("still marks changes notified when nobody follows them", () => {
    const plan = planChangePushes([change({ id: 4 })], sessions, [sub("nobody", { wec: ["race"] })], now);
    expect(plan).toEqual({ changeIds: [4], pushes: [] });
    expect(planChangePushes([change({ id: 5 })], sessions, [], now)).toEqual({ changeIds: [5], pushes: [] });
  });

  it("marks but skips changes whose Session is unknown", () => {
    const plan = planChangePushes([change({ id: 6, sessionId: "gone" })], sessions, subs, now);
    expect(plan).toEqual({ changeIds: [6], pushes: [] });
  });

  it("skips pushes about Sessions already under way", () => {
    const late = new Date("2026-11-21T14:05:00Z");
    expect(planChangePushes([change({ id: 7 })], sessions, subs, late).pushes).toEqual([]);
    // A delay announced after the original start, to a time still ahead, is pushed.
    const delayed = change({ id: 8, newStartsAt: new Date("2026-11-21T14:30:00Z") });
    expect(planChangePushes([delayed], sessions, subs, late).pushes).toHaveLength(2);
  });

  it("sets the TTL to expire when the Session starts", () => {
    const plan = planChangePushes([change({ id: 9 })], sessions, subs, now);
    expect(plan.pushes[0].ttlSeconds).toBe((moved.getTime() - now.getTime()) / 1000);
  });
});

describe("coalesceChanges", () => {
  it("merges several moves of one Session into one notice from the first old time to the last new time", () => {
    const later = new Date("2026-11-21T15:00:00Z");
    const notices = coalesceChanges([
      change({ id: 11, previousStartsAt: moved, newStartsAt: later }),
      change({ id: 10 }),
    ]);
    expect(notices).toEqual([
      { changeIds: [10, 11], sessionId: quali.id, kind: "time", previousStartsAt: previous, newStartsAt: later },
    ]);
  });

  it("treats a move and move-back as unchanged (no push)", () => {
    const rows = [change({ id: 12 }), change({ id: 13, previousStartsAt: moved, newStartsAt: previous })];
    expect(coalesceChanges(rows)[0].kind).toBe("unchanged");
    expect(planChangePushes(rows, sessions, [sub("x", { f1: ["qualifying"] })], now)).toEqual({ changeIds: [12, 13], pushes: [] });
  });

  it("ends as cancelled when the last change is a cancellation", () => {
    const rows = [change({ id: 14 }), change({ id: 15, kind: "cancelled", previousStartsAt: moved, newStartsAt: null })];
    const [notice] = coalesceChanges(rows);
    expect(notice.kind).toBe("cancelled");
    expect(notice.previousStartsAt).toEqual(previous);
  });
});
