import { describe, expect, it, vi } from "vitest";
import type { OutgoingPush } from "./types";

const sendNotification = vi.fn(async (): Promise<unknown> => ({ statusCode: 201 }));
vi.mock("web-push", () => ({ default: { sendNotification } }));

const { classifyPushError, mapWithConcurrency, sendPush } = await import("./push");
// web-push is CommonJS: the real module's functions sit on its default export at runtime.
const realWebPush = (await vi.importActual<{ default: typeof import("web-push") }>("web-push")).default;

/** The error the real web-push throws for a bad VAPID_SUBJECT, before any request is made. */
function badSubjectError(): unknown {
  try {
    realWebPush.getVapidHeaders("https://fcm.googleapis.com", "not a url", "pub", "priv", "aes128gcm");
  } catch (error) {
    return error;
  }
  throw new Error("expected getVapidHeaders to throw");
}

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

  it("reports a bad VAPID subject as an error, not a failure of the subscription", async () => {
    const error = badSubjectError();
    expect((error as Error).message).toMatch(/^Vapid subject is not a valid URL/);
    expect((error as { statusCode?: number }).statusCode).toBeUndefined();
    sendNotification.mockRejectedValueOnce(error);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await sendPush(push("https://fcm.googleapis.com/fcm/send/abc"), vapid)).toBe("error");
    expect(warn).toHaveBeenCalledWith("[alerts] push error", "sub-1", expect.stringMatching(/^Vapid subject/));
    warn.mockRestore();
  });
});

describe("classifyPushError", () => {
  it("treats 404 and 410 as a subscription that is gone for good", () => {
    expect(classifyPushError({ statusCode: 404 })).toBe("gone");
    expect(classifyPushError({ statusCode: 410 })).toBe("gone");
  });
  it("treats another 4xx as the push service refusing this subscription", () => {
    expect(classifyPushError({ statusCode: 400 })).toBe("failed");
    expect(classifyPushError({ statusCode: 403 })).toBe("failed");
    expect(classifyPushError({ statusCode: 413 })).toBe("failed");
  });
  it("treats rate limits, push service outages and errors without a status as faults outside the subscription", () => {
    expect(classifyPushError({ statusCode: 429 })).toBe("error");
    expect(classifyPushError({ statusCode: 500 })).toBe("error");
    expect(classifyPushError({ statusCode: 503 })).toBe("error");
    expect(classifyPushError(new Error("socket hang up"))).toBe("error");
    expect(classifyPushError(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }))).toBe("error");
    expect(classifyPushError(badSubjectError())).toBe("error");
    expect(classifyPushError(undefined)).toBe("error");
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
