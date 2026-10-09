import { describe, expect, it } from "vitest";
import { isReminderDue, reminderKey, REMINDER_CATCH_UP_MINUTES, selectDueReminders } from "./reminders";
import type { AlertSession, AlertSubscription } from "./types";

const MIN = 60_000;
const start = new Date("2026-11-21T22:00:00Z");

function sub(overrides: Partial<AlertSubscription> = {}): AlertSubscription {
  return {
    id: "sub-1",
    endpoint: "https://push.example/1",
    p256dh: "p",
    auth: "a",
    leadMinutes: 15,
    follows: { f1: ["qualifying", "race"] },
    timeZone: "UTC",
    failureCount: 0,
    ...overrides,
  };
}

function session(overrides: Partial<AlertSession> = {}): AlertSession {
  return {
    id: "f1-2026-las-vegas:qualifying",
    series: "f1",
    type: "qualifying",
    name: "Qualifying",
    startsAt: start,
    status: "scheduled",
    roundName: "Las Vegas Grand Prix",
    timesConfirmed: true,
    ...overrides,
  };
}

const at = (minutesFromStart: number) => new Date(start.getTime() + minutesFromStart * MIN);

describe("isReminderDue", () => {
  it.each([15, 60, 1440])("is due exactly %i minutes before start", (lead) => {
    expect(isReminderDue(start, lead, at(-lead))).toBe(true);
  });

  it("is not due before the reminder time", () => {
    expect(isReminderDue(start, 15, at(-16))).toBe(false);
    expect(isReminderDue(start, 60, at(-61))).toBe(false);
    expect(isReminderDue(start, 1440, at(-1441))).toBe(false);
  });

  it("catches up within the window after a missed run", () => {
    expect(isReminderDue(start, 60, at(-60 + REMINDER_CATCH_UP_MINUTES - 1))).toBe(true);
    expect(isReminderDue(start, 60, at(-60 + REMINDER_CATCH_UP_MINUTES))).toBe(false);
    expect(isReminderDue(start, 1440, at(-1440 + 9))).toBe(true);
  });

  it("never reminds about a Session that has started", () => {
    expect(isReminderDue(start, 15, at(0))).toBe(false);
    expect(isReminderDue(start, 15, at(1))).toBe(false);
    // 15-minute lead, 9 minutes late: inside the window and the Session has not started yet.
    expect(isReminderDue(start, 15, at(-6))).toBe(true);
    // A 1-minute-to-go catch-up is outside the window anyway.
    expect(isReminderDue(start, 15, at(-1))).toBe(false);
  });
});

describe("selectDueReminders", () => {
  it("selects followed Series × Session Types only", () => {
    const sessions = [
      session(),
      session({ id: "f1:fp1", type: "practice", name: "Free Practice 1" }),
      session({ id: "f2:q", series: "f2", type: "qualifying" }),
    ];
    const due = selectDueReminders([sub()], sessions, at(-15));
    expect(due.map((d) => d.sessionId)).toEqual(["f1-2026-las-vegas:qualifying"]);
  });

  it("uses each subscription's own lead time", () => {
    const subs = [sub({ id: "a", leadMinutes: 15 }), sub({ id: "b", leadMinutes: 60 }), sub({ id: "c", leadMinutes: 1440 })];
    expect(selectDueReminders(subs, [session()], at(-15)).map((d) => d.subscription.id)).toEqual(["a"]);
    expect(selectDueReminders(subs, [session()], at(-60)).map((d) => d.subscription.id)).toEqual(["b"]);
    expect(selectDueReminders(subs, [session()], at(-1440)).map((d) => d.subscription.id)).toEqual(["c"]);
  });

  it("excludes cancelled Sessions and Rounds with unconfirmed times", () => {
    expect(selectDueReminders([sub()], [session({ status: "cancelled" })], at(-15))).toEqual([]);
    expect(selectDueReminders([sub()], [session({ timesConfirmed: false })], at(-15))).toEqual([]);
  });

  it("writes the push text in the subscriber's time zone and opens the Series page", () => {
    const [utc] = selectDueReminders([sub()], [session()], at(-15));
    expect(utc.payload).toEqual({
      title: "F1 Qualifying in 15 min",
      body: "Las Vegas Grand Prix · starts 22:00",
      url: "/f1",
      tag: "session:f1-2026-las-vegas:qualifying",
    });
    expect(utc.ttlSeconds).toBe(15 * 60);

    const [la] = selectDueReminders([sub({ timeZone: "America/Los_Angeles" })], [session()], at(-15));
    expect(la.payload.body).toBe("Las Vegas Grand Prix · starts 14:00");

    const [tokyo] = selectDueReminders([sub({ timeZone: "Asia/Tokyo", leadMinutes: 60 })], [session()], at(-60));
    expect(tokyo.payload.title).toBe("F1 Qualifying in 1 hour");
    // 21:00Z and 22:00Z are both Sunday morning in Tokyo, so no weekday.
    expect(tokyo.payload.body).toBe("Las Vegas Grand Prix · starts 07:00");

    const [dayBefore] = selectDueReminders([sub({ leadMinutes: 1440 })], [session()], at(-1440));
    expect(dayBefore.payload.title).toBe("F1 Qualifying in 24 hours");
    expect(dayBefore.payload.body).toBe("Las Vegas Grand Prix · starts Sat 22:00");
  });

  it("reports the real time left when catching up late", () => {
    const [late] = selectDueReminders([sub()], [session()], at(-11));
    expect(late.payload.title).toBe("F1 Qualifying in 11 min");
  });
});

describe("reminderKey", () => {
  it("is keyed by subscription, Session and start time, so a moved Session can be reminded again", () => {
    const before = reminderKey("sub-1", "s1", start);
    expect(before).toBe("sub-1|s1|2026-11-21T22:00:00.000Z");
    expect(reminderKey("sub-1", "s1", at(30))).not.toBe(before);
    expect(reminderKey("sub-2", "s1", start)).not.toBe(before);
    expect(reminderKey("sub-1", "s1", new Date(start.getTime()))).toBe(before);
  });

  it("selects a moved Session again at its new reminder time", () => {
    const moved = session({ startsAt: at(45) });
    const first = selectDueReminders([sub()], [session()], at(-15));
    const second = selectDueReminders([sub()], [moved], at(30));
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(reminderKey(first[0].subscription.id, first[0].sessionId, first[0].startsAt)).not.toBe(
      reminderKey(second[0].subscription.id, second[0].sessionId, second[0].startsAt),
    );
  });
});
