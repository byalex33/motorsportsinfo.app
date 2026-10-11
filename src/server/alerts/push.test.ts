import { describe, expect, it, vi } from "vitest";
import type { OutgoingPush } from "./types";

const sendNotification = vi.fn(async () => ({ statusCode: 201 }));
vi.mock("web-push", () => ({ default: { sendNotification } }));

const { classifyPushError, mapWithConcurrency, sendPush } = await import("./push");

const vapid = { publicKey: "pub", privateKey: "priv", subject: "mailto:x@example.com" };
const push = (endpoint: string): OutgoingPush => ({
  subscription: {
    id: "sub-1",
    endpoint,
    p256dh: "p256dh",
    auth: "auth",
    leadMinutes: 15,
    follows: { f1: ["race"] },
    documentAlerts: {},
    timeZone: "UTC",
    failureCount: 0,
  },
  payload: { title: "F1 · Race", body: "Starts in 15 minutes", url: "/f1", tag: "session:f1-x" },
  ttlSeconds: 900,
});

describe("sendPush", () => {
  it("sends to a browser push service", async () => {
    sendNotification.mockClear();
    expect(await sendPush(push("https://fcm.googleapis.com/fcm/send/abc"), vapid)).toBe("sent");
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("never sends to an endpoint off the push services, and reports it gone so it is deleted", async () => {
    sendNotification.mockClear();
    expect(await sendPush(push("https://victim.example/hook"), vapid)).toBe("gone");
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("classifyPushError", () => {
  it("treats 404 and 410 as a subscription that is gone for good", () => {
    expect(classifyPushError({ statusCode: 404 })).toBe("gone");
    expect(classifyPushError({ statusCode: 410 })).toBe("gone");
  });
  it("treats everything else as a temporary failure", () => {
    expect(classifyPushError({ statusCode: 429 })).toBe("failed");
    expect(classifyPushError({ statusCode: 500 })).toBe("failed");
    expect(classifyPushError(new Error("socket hang up"))).toBe("failed");
    expect(classifyPushError(undefined)).toBe("failed");
  });
});

describe("mapWithConcurrency", () => {
  it("keeps order and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([5, 1, 4, 2, 3, 0, 6], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, n));
      inFlight--;
      return n * 10;
    });
    expect(results).toEqual([50, 10, 40, 20, 30, 0, 60]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 10, async () => 1)).toEqual([]);
  });
});
