import { describe, expect, it } from "vitest";
import { isValidTimeZone, rotateSchema, subscribeSchema, unsubscribeSchema } from "./validation";

const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  expirationTime: null,
  keys: {
    p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
    auth: "tBHItJI5svbpez7KI4CCXg",
  },
};

const valid = {
  subscription,
  follows: { f1: ["qualifying", "race"], wec: ["hyperpole"] },
  leadMinutes: 15,
  timeZone: "Europe/London",
};

describe("subscribeSchema", () => {
  it("accepts a well-formed subscription and normalizes follows", () => {
    const parsed = subscribeSchema.parse({ ...valid, follows: { f1: ["race", "qualifying", "race"] } });
    expect(parsed.follows).toEqual({ f1: ["qualifying", "race"] });
    expect(parsed.leadMinutes).toBe(15);
  });

  it("accepts every allowed lead time and empty follows", () => {
    for (const leadMinutes of [15, 60, 1440]) {
      expect(subscribeSchema.safeParse({ ...valid, leadMinutes, follows: {} }).success).toBe(true);
    }
  });

  it.each([
    ["http endpoint", { ...valid, subscription: { ...subscription, endpoint: "http://push.example.com/x" } }],
    ["non-URL endpoint", { ...valid, subscription: { ...subscription, endpoint: "not a url" } }],
    ["missing keys", { ...valid, subscription: { endpoint: subscription.endpoint } }],
    ["bad key chars", { ...valid, subscription: { ...subscription, keys: { ...subscription.keys, auth: "a b" } } }],
    ["unknown Series", { ...valid, follows: { nascar: ["race"] } }],
    ["Session Type from another Series", { ...valid, follows: { f2: ["hyperpole"] } }],
    ["unknown Session Type", { ...valid, follows: { f1: ["warmup"] } }],
    ["follows not arrays", { ...valid, follows: { f1: "race" } }],
    ["lead time not offered", { ...valid, leadMinutes: 30 }],
    ["lead time as string", { ...valid, leadMinutes: "15" }],
    ["unknown zone", { ...valid, timeZone: "Mars/Olympus_Mons" }],
    ["offset instead of zone", { ...valid, timeZone: "+01:00" }],
    ["missing zone", { ...valid, timeZone: undefined }],
  ])("rejects %s", (_name, input) => {
    expect(subscribeSchema.safeParse(input).success).toBe(false);
  });
});

describe("isValidTimeZone", () => {
  it.each(["UTC", "Europe/London", "America/Argentina/Buenos_Aires", "Asia/Kolkata", "Etc/GMT+5"])("accepts %s", (tz) => {
    expect(isValidTimeZone(tz)).toBe(true);
  });
  it.each(["", "Nowhere/Town", "../etc/passwd", "Europe/London; DROP", "+05:30"])("rejects %j", (tz) => {
    expect(isValidTimeZone(tz)).toBe(false);
  });
});

describe("unsubscribe and rotate", () => {
  it("requires an https endpoint", () => {
    expect(unsubscribeSchema.safeParse({ endpoint: subscription.endpoint }).success).toBe(true);
    expect(unsubscribeSchema.safeParse({ endpoint: "ftp://x" }).success).toBe(false);
  });
  it("requires both the old endpoint and a full new subscription", () => {
    expect(rotateSchema.safeParse({ oldEndpoint: "https://a.example/1", subscription }).success).toBe(true);
    expect(rotateSchema.safeParse({ oldEndpoint: "https://a.example/1" }).success).toBe(false);
  });
});
