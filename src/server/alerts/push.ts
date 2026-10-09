import webpush from "web-push";
import type { OutgoingPush } from "./types";

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

export async function sendPush(push: OutgoingPush, vapid: VapidConfig): Promise<PushOutcome> {
  const { subscription, payload, ttlSeconds } = push;
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
