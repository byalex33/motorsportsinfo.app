import "server-only";
import webpush from "web-push";
import type { OutgoingPush } from "./types";
import { isPushServiceEndpoint } from "./validation";

/** Pushes sent at once. */
export const PUSH_CONCURRENCY = 10;
/** A subscription is deleted after this many failed sends in a row. */
export const MAX_PUSH_FAILURES = 5;

/**
 * What one send did:
 * - "sent": the push service accepted it.
 * - "gone": the browser dropped the subscription for good (404/410); it is deleted.
 * - "failed": the push service refused this subscription (another 4xx); it counts towards MAX_PUSH_FAILURES.
 * - "error": the send never got an answer about this subscription (no HTTP status, 429 or 5xx): a config,
 *   network or push service fault that says nothing about the subscription, so it never counts against it.
 */
export type PushOutcome = "sent" | "gone" | "failed" | "error";

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

/**
 * 404/410 mean the browser dropped the subscription for good; another 4xx is the push service refusing this
 * subscription. No status (bad VAPID config, DNS or egress fault), 429 and 5xx are faults outside it.
 */
export function classifyPushError(error: unknown): Exclude<PushOutcome, "sent"> {
  const status = typeof error === "object" && error !== null ? (error as { statusCode?: unknown }).statusCode : undefined;
  if (status === 404 || status === 410) return "gone";
  if (typeof status === "number" && status >= 400 && status < 500 && status !== 429) return "failed";
  return "error";
}

export async function sendPush(push: OutgoingPush, vapid: VapidConfig): Promise<PushOutcome> {
  const { subscription, payload, ttlSeconds } = push;
  // Rows saved before the push service check could point anywhere: never send to them, and drop them.
  if (!isPushServiceEndpoint(subscription.endpoint)) return "gone";
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      {
        vapidDetails: vapid,
        TTL: ttlSeconds,
        urgency: "high",
        contentEncoding: "aes128gcm",
        timeout: 10_000,
      },
    );
    return "sent";
  } catch (error) {
    const outcome = classifyPushError(error);
    if (outcome !== "gone") console.warn(`[alerts] push ${outcome}`, subscription.id, describeError(error));
    return outcome;
  }
}

function describeError(error: unknown): string {
  const status = error && typeof error === "object" ? (error as { statusCode?: unknown }).statusCode : undefined;
  if (typeof status === "number") return `HTTP ${status}`;
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
