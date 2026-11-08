import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import type { ConfirmOutcome } from "./push";
import { MAX_SUBSCRIPTIONS, NEW_DEVICES_PER_HOUR, clientKey, upsertSubscription } from "./subscriptions";
import type { SubscribeInput } from "./validation";

const input: SubscribeInput = {
  subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/device", keys: { p256dh: "p256dh", auth: "auth" } },
  follows: { f1: ["race"] },
  documentAlerts: {},
  leadMinutes: 15,
  timeZone: "Europe/London",
};

/** A database holding `total` subscriptions (this device's among them when `known`) and `recent` sign-ups from the client. */
function fakeDb({ total = 0, known = false, recent = 0 }: { total?: number; known?: boolean; recent?: number }) {
  const statements: string[] = [];
  const db = drizzle(
    async (sql) => {
      statements.push(sql);
      if (/^select count\(\*\) from "push_subscriptions"/.test(sql)) return { rows: [[total]] };
      if (/^select count\(\*\) from "push_signup_attempts"/.test(sql)) return { rows: [[recent]] };
      if (/^select .* from "push_subscriptions" where/.test(sql)) return { rows: known ? [["id-1"]] : [] };
      return { rows: [] };
    },
    { schema },
  );
  const inserts = () => statements.filter((s) => /^insert into "push_subscriptions"/.test(s)).length;
  const attempts = () => statements.filter((s) => /^insert into "push_signup_attempts"/.test(s)).length;
  return { db: db as unknown as Db, inserts, attempts };
}

/** Checks whose confirmation push has the given outcome, counting how often it is sent. */
function checks(outcome: ConfirmOutcome = "sent", client: string | null = "client-1") {
  const sent: string[] = [];
  return {
    sent,
    checks: {
      client,
      confirm: async (subscription: SubscribeInput["subscription"]) => {
        sent.push(subscription.endpoint);
        return outcome;
      },
    },
  };
}

describe("upsertSubscription", () => {
  it("saves a new device once its confirmation push is accepted", async () => {
    const { db, inserts, attempts } = fakeDb({ total: MAX_SUBSCRIPTIONS - 1 });
    const c = checks();
    expect(await upsertSubscription(db, input, c.checks)).toBe("saved");
    expect(c.sent).toEqual([input.subscription.endpoint]);
    expect(attempts()).toBe(1);
    expect(inserts()).toBe(1);
  });

  it("does not save a new device whose push service refuses the confirmation push", async () => {
    const { db, inserts } = fakeDb({});
    expect(await upsertSubscription(db, input, checks("refused").checks)).toBe("refused");
    expect(inserts()).toBe(0);
  });

  it("does not save a new device while its push service cannot be reached", async () => {
    const { db, inserts } = fakeDb({});
    expect(await upsertSubscription(db, input, checks("unavailable").checks)).toBe("unavailable");
    expect(inserts()).toBe(0);
  });

  it("refuses a new device, without pushing to it, once the client has signed up its hourly limit", async () => {
    const { db, inserts, attempts } = fakeDb({ recent: NEW_DEVICES_PER_HOUR });
    const c = checks();
    expect(await upsertSubscription(db, input, c.checks)).toBe("limited");
    expect(c.sent).toEqual([]);
    expect(attempts()).toBe(0);
    expect(inserts()).toBe(0);
  });

  it("skips the hourly limit when the client is not known", async () => {
    const { db, inserts, attempts } = fakeDb({ recent: NEW_DEVICES_PER_HOUR });
    expect(await upsertSubscription(db, input, checks("sent", null).checks)).toBe("saved");
    expect(attempts()).toBe(0);
    expect(inserts()).toBe(1);
  });

  it("refuses a new device, without pushing to it, once the table is full", async () => {
    const { db, inserts } = fakeDb({ total: MAX_SUBSCRIPTIONS });
    const c = checks();
    expect(await upsertSubscription(db, input, c.checks)).toBe("full");
    expect(c.sent).toEqual([]);
    expect(inserts()).toBe(0);
  });

  it("updates a device it already has without a confirmation push or limit, even when the table is full", async () => {
    const { db, inserts, attempts } = fakeDb({ total: MAX_SUBSCRIPTIONS, known: true, recent: NEW_DEVICES_PER_HOUR });
    const c = checks("refused");
    expect(await upsertSubscription(db, input, c.checks)).toBe("saved");
    expect(c.sent).toEqual([]);
    expect(attempts()).toBe(0);
    expect(inserts()).toBe(1);
  });
});

describe("clientKey", () => {
  const headers = (h: Record<string, string>) => new Headers(h);

  it("keys a client by an HMAC of its address, never the address itself", () => {
    const key = clientKey(headers({ "x-real-ip": "203.0.113.7" }), "secret");
    expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(key).not.toContain("203");
    expect(clientKey(headers({ "x-real-ip": "203.0.113.7" }), "secret")).toBe(key);
    expect(clientKey(headers({ "x-real-ip": "203.0.113.8" }), "secret")).not.toBe(key);
    expect(clientKey(headers({ "x-real-ip": "203.0.113.7" }), "other")).not.toBe(key);
  });

  it("falls back to the first x-forwarded-for address, and to null with none", () => {
    expect(clientKey(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), "s")).toBe(clientKey(headers({ "x-real-ip": "203.0.113.7" }), "s"));
    expect(clientKey(headers({}), "s")).toBeNull();
  });
});
