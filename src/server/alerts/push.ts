import "server-only";
import webpush from "web-push";
import type { OutgoingPush, PushPayload } from "./types";
import { isPushServiceEndpoint } from "./validation";

/** Pushes sent at once. */
export const PUSH_CONCURRENCY = 10;
/** A subscription is deleted after this many failed sends in a row. */
export const MAX_PUSH_FAILURES = 5;

export type PushOutcome = "sent" | "gone" | "failed";

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

/** 404/410 mean the browser dropped the subscription for good; anything else may be temporary. */
export function classifyPushError(error: unknown): Exclude<PushOutcome, "sent"> {
  const status = typeof error === "object" && error !== null ? (error as { statusCode?: unknown }).statusCode : undefined;
  return status === 404 || status === 410 ? "gone" : "failed";
}

type Target = { endpoint: string; p256dh: string; auth: string };

/** One Web Push request. Throws what web-push throws (a WebPushError with statusCode for an HTTP refusal). */
async function deliver(target: Target, payload: PushPayload, ttlSeconds: number, vapid: VapidConfig): Promise<void> {
  await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(payload), {
    vapidDetails: vapid,
    TTL: ttlSeconds,
    urgency: "high",
    contentEncoding: "aes128gcm",
    timeout: 10_000,
  });
}

export async function sendPush(push: OutgoingPush, vapid: VapidConfig): Promise<PushOutcome> {
  const { subscription, payload, ttlSeconds } = push;
  // Rows saved before the push service check could point anywhere: never send to them, and drop them.
  if (!isPushServiceEndpoint(subscription.endpoint)) return "gone";
  try {
    await deliver(subscription, payload, ttlSeconds, vapid);
    return "sent";
  } catch (error) {
    const outcome = classifyPushError(error);
    if (outcome === "failed") console.warn("[alerts] push failed", subscription.id, describeError(error));
    return outcome;
  }
}

function describeError(error: unknown): string {
  if (error && typeof error === "object" && "statusCode" in error) {
    return `HTTP ${(error as { statusCode: number }).statusCode}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Runs `fn` over `items` with at most `limit` in flight. Results keep input order. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** The first push to a device, sent before it is saved (see upsertSubscription). */
export const CONFIRMATION_PAYLOAD: PushPayload = {
  title: "Alerts are on",
  body: "This device will get the alerts you chose. You can change them on the Alerts page.",
  url: "/alerts",
  tag: "alerts:confirmed",
};

export type ConfirmOutcome = "sent" | "refused" | "unavailable";

/**
 * Sends a new device its confirmation push, which proves the subscription is real and was made for this
 * site's VAPID key: a push service refuses (4xx) an endpoint that does not exist, or one made for another
 * key. "unavailable" when it could not be asked (a timeout, a 5xx), so a hiccup is not taken as a refusal.
 */
export async function sendConfirmationPush(target: Target, vapid: VapidConfig): Promise<ConfirmOutcome> {
  if (!isPushServiceEndpoint(target.endpoint)) return "refused";
  try {
    await deliver(target, CONFIRMATION_PAYLOAD, 300, vapid);
    return "sent";
  } catch (error) {
    const outcome = classifyConfirmationError(error);
    if (outcome === "unavailable") console.warn("[alerts] confirmation push failed", describeError(error));
    return outcome;
  }
}

/** A 4xx (other than 429, rate limited) is the push service saying no; anything else may be temporary. */
export function classifyConfirmationError(error: unknown): Exclude<ConfirmOutcome, "sent"> {
  const status = typeof error === "object" && error !== null ? (error as { statusCode?: unknown }).statusCode : undefined;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 429 ? "refused" : "unavailable";
}
