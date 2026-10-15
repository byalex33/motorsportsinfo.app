import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { MAX_SUBSCRIPTIONS, upsertSubscription } from "./subscriptions";
import type { SubscribeInput } from "./validation";

const input: SubscribeInput = {
  subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/device", keys: { p256dh: "p256dh", auth: "auth" } },
  follows: { f1: ["race"] },
  documentAlerts: {},
  leadMinutes: 15,
  timeZone: "Europe/London",
};

/** A database holding `total` subscriptions, of which this device's endpoint is one when `known`. */
function fakeDb(total: number, known: boolean) {
  const statements: string[] = [];
  const db = drizzle(
    async (sql) => {
      statements.push(sql);
      if (/^select count\(\*\) from "push_subscriptions"/.test(sql)) return { rows: [[total]] };
      if (/^select .* from "push_subscriptions" where/.test(sql)) return { rows: known ? [["id-1"]] : [] };
      return { rows: [] };
    },
    { schema },
  );
  const inserts = () => statements.filter((s) => /^insert into "push_subscriptions"/.test(s)).length;
  return { db: db as unknown as Db, inserts };
}

describe("upsertSubscription", () => {
  it("saves a new device while there is room", async () => {
    const { db, inserts } = fakeDb(MAX_SUBSCRIPTIONS - 1, false);
    expect(await upsertSubscription(db, input)).toBe("saved");
    expect(inserts()).toBe(1);
  });

  it("refuses a new device once the table is full", async () => {
    const { db, inserts } = fakeDb(MAX_SUBSCRIPTIONS, false);
    expect(await upsertSubscription(db, input)).toBe("full");
    expect(inserts()).toBe(0);
  });

  it("still updates a device it already has when the table is full", async () => {
    const { db, inserts } = fakeDb(MAX_SUBSCRIPTIONS, true);
    expect(await upsertSubscription(db, input)).toBe("saved");
    expect(inserts()).toBe(1);
  });
});
