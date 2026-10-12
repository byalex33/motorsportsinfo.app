import { describe, expect, it } from "vitest";
import { isPushServiceEndpoint, isValidTimeZone, rotateSchema, subscribeSchema, unsubscribeSchema } from "./validation";

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

  it("defaults Document Alerts to none, for pages saved before they existed", () => {
    expect(subscribeSchema.parse(valid).documentAlerts).toEqual({});
  });

  it("accepts Document Alerts for FIA Series and rejects anything else", () => {
    expect(subscribeSchema.parse({ ...valid, documentAlerts: { f1: "stewards", f3: "all" } }).documentAlerts).toEqual({
      f1: "stewards",
      f3: "all",
    });
    expect(subscribeSchema.safeParse({ ...valid, documentAlerts: { wec: "all" } }).success).toBe(false);
    expect(subscribeSchema.safeParse({ ...valid, documentAlerts: { f1: "loud" } }).success).toBe(false);
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
    ["unknown Series", { ...valid, follows: { btcc: ["race"] } }],
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

describe("push service endpoints", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc123",
    "https://fcm.googleapis.com/wp/abc123",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAA",
    "https://push.services.mozilla.com/wpush/v1/gAAAAA",
    "https://web.push.apple.com/QGuQyavXutnMH6E1KfqlBpqzmAQf",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB",
  ])("accepts %s", (endpoint) => {
    expect(isPushServiceEndpoint(endpoint)).toBe(true);
    expect(subscribeSchema.safeParse({ ...valid, subscription: { ...subscription, endpoint } }).success).toBe(true);
  });

  it.each([
    ["any other host", "https://victim.example/hook"],
    ["a look-alike suffix", "https://fcm.googleapis.com.evil.example/fcm/send/x"],
    ["a look-alike prefix", "https://evilfcm.googleapis.com/fcm/send/x"],
    ["a look-alike Mozilla host", "https://push.services.mozilla.com.evil.example/x"],
    ["bare notify.windows.com", "https://notify.windows.com/w/"],
    ["http", "http://fcm.googleapis.com/fcm/send/x"],
    ["a non-default port", "https://fcm.googleapis.com:8443/fcm/send/x"],
    ["credentials", "https://user:pass@fcm.googleapis.com/fcm/send/x"],
    ["an IP address", "https://142.250.0.1/fcm/send/x"],
    ["not a URL", "fcm.googleapis.com/fcm/send/x"],
  ])("rejects %s", (_name, endpoint) => {
    expect(isPushServiceEndpoint(endpoint)).toBe(false);
    expect(subscribeSchema.safeParse({ ...valid, subscription: { ...subscription, endpoint } }).success).toBe(false);
  });

  it("is case-insensitive in the host, like browsers", () => {
    expect(isPushServiceEndpoint("https://FCM.googleapis.com/fcm/send/x")).toBe(true);
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
  it("lets any https endpoint unsubscribe, since that only deletes a stored row", () => {
    expect(unsubscribeSchema.safeParse({ endpoint: "https://legacy.example/push/1" }).success).toBe(true);
  });
  it("requires both the old endpoint and a full new subscription", () => {
    expect(rotateSchema.safeParse({ oldEndpoint: "https://a.example/1", subscription }).success).toBe(true);
    expect(rotateSchema.safeParse({ oldEndpoint: "https://a.example/1" }).success).toBe(false);
  });
  it("requires the new subscription to be on a push service", () => {
    const elsewhere = { ...subscription, endpoint: "https://victim.example/hook" };
    expect(rotateSchema.safeParse({ oldEndpoint: subscription.endpoint, subscription: elsewhere }).success).toBe(false);
  });
});
