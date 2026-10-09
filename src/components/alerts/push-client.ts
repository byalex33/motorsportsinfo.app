// Browser-side Web Push helpers for the Alerts page.
import type { ReminderLeadMinutes } from "@/domain/series";
import type { Follows } from "@/server/alerts/selection";

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const SUBSCRIPTION_API = "/api/push/subscription";
/** Owned by the app shell; it does importScripts("/sw-push.js"). */
const SERVICE_WORKER_URL = "/sw.js";

export type PushSupport =
  | "checking"
  | "supported"
  /** iPhone/iPad in a browser tab: Apple only allows web push for Home Screen web apps. */
  | "ios-needs-install"
  /** Installed on iOS, but iOS is older than 16.4. */
  | "ios-too-old"
  | "unsupported"
  | "denied"
  | "not-configured";

export function isIos(nav: Navigator): boolean {
  const ua = nav.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /Macintosh/.test(ua) && nav.maxTouchPoints > 1;
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  try {
    return window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

export function detectPushSupport(): PushSupport {
  if (typeof window === "undefined") return "checking";
  const hasApis = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIos(navigator)) {
    if (!isStandalone()) return "ios-needs-install";
    if (!hasApis) return "ios-too-old";
  }
  if (!hasApis) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "not-configured";
  if (Notification.permission === "denied") return "denied";
  return "supported";
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) await navigator.serviceWorker.register(SERVICE_WORKER_URL);
  // Subscribing needs an active worker.
  return navigator.serviceWorker.ready;
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function subscribeDevice(): Promise<PushSubscription> {
  const registration = await getRegistration();
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export type SaveResult = { ok: true } | { ok: false; message: string };

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // not JSON
  }
  return `The server could not save your reminders (error ${res.status}).`;
}

export async function saveSubscription(
  subscription: PushSubscription,
  follows: Follows,
  leadMinutes: ReminderLeadMinutes,
): Promise<SaveResult> {
  try {
    const res = await fetch(SUBSCRIPTION_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON(), follows, leadMinutes, timeZone: browserTimeZone() }),
    });
    return res.ok ? { ok: true } : { ok: false, message: await errorMessage(res) };
  } catch {
    return { ok: false, message: "Could not reach the server. Check your connection and try again." };
  }
}

/** Unsubscribes this browser and deletes the server-side record. */
export async function removeSubscription(subscription: PushSubscription): Promise<void> {
  const { endpoint } = subscription;
  await subscription.unsubscribe().catch(() => false);
  await fetch(SUBSCRIPTION_API, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }).catch(() => undefined);
}
