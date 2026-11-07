// Database writes for push subscriptions (subscribe / unsubscribe / browser rotation).
import { createHmac } from "node:crypto";
import { and, count, eq, gt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { pushSignupAttempts, pushSubscriptions } from "@/db/schema";
import type { ConfirmOutcome } from "./push";
import type { SubscribeInput } from "./validation";

/**
 * push_subscriptions holds at most this many rows. The alerts cron reads them all each busy minute, so a
 * flood of made-up endpoints must not grow it without bound. Existing devices can always update.
 */
export const MAX_SUBSCRIPTIONS = 50_000;

/** New devices one client may sign up in an hour. Generous for a shared network, small for a script. */
export const NEW_DEVICES_PER_HOUR = 10;

/** What must hold before a new device is saved. Existing devices skip both, so they can always update. */
export interface NewDeviceChecks {
  /** The client asking, as an HMAC of its IP address (see clientKey), or null when it is not known. */
  client: string | null;
  /** Sends the device its confirmation push (sendConfirmationPush). */
  confirm: (subscription: SubscribeInput["subscription"]) => Promise<ConfirmOutcome>;
}

export type UpsertResult =
  | "saved"
  /** The table holds MAX_SUBSCRIPTIONS rows. */
  | "full"
  /** The client signed up NEW_DEVICES_PER_HOUR new devices in the last hour. */
  | "limited"
  /** The push service refused the confirmation push: the subscription is not a real one for this site. */
  | "refused"
  /** The push service could not be asked; nothing was saved. */
  | "unavailable";

/**
 * Saves a device's choices. A device already saved is updated. A new one is saved only when its client is
 * under the hourly limit, the table has room, and the push service accepts a confirmation push to it, so a
 * made-up endpoint (or one created for another site) never takes a row.
 */
export async function upsertSubscription(db: Db, input: SubscribeInput, checks: NewDeviceChecks): Promise<UpsertResult> {
  const [existing] = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, input.subscription.endpoint));
  if (!existing) {
    if (checks.client !== null) {
      const [{ recent }] = await db
        .select({ recent: count() })
        .from(pushSignupAttempts)
        .where(and(eq(pushSignupAttempts.client, checks.client), gt(pushSignupAttempts.attemptedAt, sql`now() - interval '1 hour'`)));
      if (recent >= NEW_DEVICES_PER_HOUR) return "limited";
      // Counted before the confirmation push, so refused attempts count too.
      await db.insert(pushSignupAttempts).values({ client: checks.client });
    }
    const [{ total }] = await db.select({ total: count() }).from(pushSubscriptions);
    if (total >= MAX_SUBSCRIPTIONS) {
      console.warn(`[alerts] push_subscriptions is full (${total} rows): refused a new subscription`);
      return "full";
    }
    const confirmed = await checks.confirm(input.subscription);
    if (confirmed !== "sent") return confirmed;
  }
  const values = {
    endpoint: input.subscription.endpoint,
    p256dh: input.subscription.keys.p256dh,
    auth: input.subscription.keys.auth,
    follows: input.follows,
    documentAlerts: input.documentAlerts,
    leadMinutes: input.leadMinutes,
    timeZone: input.timeZone,
  };
  await db
    .insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { ...values, failureCount: 0, updatedAt: sql`now()` },
    });
  return "saved";
}

/**
 * The client a request comes from, for the sign-up limit: an HMAC of its IP address, so the address itself is
 * never stored. Vercel sets x-real-ip; null when no address is known (local dev).
 */
export function clientKey(headers: Headers, secret: string): string | null {
  const ip = headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!ip) return null;
  return createHmac("sha256", secret).update(ip).digest("base64url").slice(0, 22);
}

/** Sign-up attempts older than a day are never needed again (the alerts cron's daily housekeeping). */
export async function pruneSignupAttempts(db: Db): Promise<void> {
  await db.delete(pushSignupAttempts).where(sql`${pushSignupAttempts.attemptedAt} < now() - interval '1 day'`);
}

export async function deleteSubscription(db: Db, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

/** Moves a device's settings to the endpoint the browser replaced it with. Returns false if the old one is unknown. */
export async function rotateSubscription(
  db: Db,
  oldEndpoint: string,
  next: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<boolean> {
  if (oldEndpoint !== next.endpoint) {
    // A row may already exist for the new endpoint (e.g. the page re-saved first); the old row's settings win.
    const [old] = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, oldEndpoint));
    if (!old) return false;
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, next.endpoint));
  }
  const updated = await db
    .update(pushSubscriptions)
    .set({
      endpoint: next.endpoint,
      p256dh: next.keys.p256dh,
      auth: next.keys.auth,
      failureCount: 0,
      updatedAt: sql`now()`,
    })
    .where(eq(pushSubscriptions.endpoint, oldEndpoint))
    .returning({ id: pushSubscriptions.id });
  return updated.length > 0;
}
