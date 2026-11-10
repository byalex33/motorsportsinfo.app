// Database writes for push subscriptions (subscribe / unsubscribe / browser rotation).
import { createHmac } from "node:crypto";
import { and, count, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
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

/**
 * What must hold before a new device, or a known device's new endpoint, is saved. Existing devices skip
 * both, so they can always update.
 */
export interface NewDeviceChecks {
  /** The client asking, as an HMAC of its IP address (see clientKey), or null when it is not known. */
  client: string | null;
  /** Sends the device its confirmation push (sendConfirmationPush). */
  confirm: (subscription: SubscribeInput["subscription"]) => Promise<ConfirmOutcome>;
}

export type UpsertResult =
  | "saved"
  /** The selection follows nothing and wants no Document Alerts: the device was deleted, as an unsubscribe. */
  | "removed"
  /** The table holds MAX_SUBSCRIPTIONS rows. */
  | "full"
  /** The client signed up NEW_DEVICES_PER_HOUR new devices in the last hour. */
  | "limited"
  /** The push service refused the confirmation push: the subscription is not a real one for this site. */
  | "refused"
  /** The push service could not be asked; nothing was saved. */
  | "unavailable";

/**
 * Whether a new endpoint may be stored: its client is under the hourly limit (this attempt counts), the table
 * has room when `needsRoom`, and the push service accepts a confirmation push to it. A sign-up and a rotation
 * to a new endpoint both go through it, so neither can store a made-up endpoint, nor more than
 * NEW_DEVICES_PER_HOUR an hour.
 */
async function admitEndpoint(
  db: Db,
  subscription: SubscribeInput["subscription"],
  checks: NewDeviceChecks,
  needsRoom: boolean,
): Promise<"ok" | "full" | "limited" | "refused" | "unavailable"> {
  if (checks.client !== null) {
    const [{ recent }] = await db
      .select({ recent: count() })
      .from(pushSignupAttempts)
      .where(and(eq(pushSignupAttempts.client, checks.client), gt(pushSignupAttempts.attemptedAt, sql`now() - interval '1 hour'`)));
    if (recent >= NEW_DEVICES_PER_HOUR) return "limited";
    // Counted before the confirmation push, so refused attempts count too.
    await db.insert(pushSignupAttempts).values({ client: checks.client });
  }
  if (needsRoom) {
    const [{ total }] = await db.select({ total: count() }).from(pushSubscriptions);
    if (total >= MAX_SUBSCRIPTIONS) {
      console.warn(`[alerts] push_subscriptions is full (${total} rows): refused a new subscription`);
      return "full";
    }
  }
  const confirmed = await checks.confirm(subscription);
  return confirmed === "sent" ? "ok" : confirmed;
}

/**
 * Saves a device's choices. A device already saved is updated. A new one is saved only when its client is
 * under the hourly limit, the table has room, and the push service accepts a confirmation push to it, so a
 * made-up endpoint (or one created for another site) never takes a row. A selection of nothing deletes the
 * device instead: it would never be pushed, so no push service would ever report it gone.
 */
export async function upsertSubscription(db: Db, input: SubscribeInput, checks: NewDeviceChecks): Promise<UpsertResult> {
  if (Object.keys(input.follows).length === 0 && Object.keys(input.documentAlerts).length === 0) {
    await deleteSubscription(db, input.subscription.endpoint);
    return "removed";
  }
  const [existing] = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, input.subscription.endpoint));
  if (!existing) {
    const admitted = await admitEndpoint(db, input.subscription, checks, true);
    if (admitted !== "ok") return admitted;
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

/** A subscription neither saved nor pushed to for this long is pruned (the alerts cron's daily housekeeping). */
export const STALE_SUBSCRIPTION_DAYS = 400;

/**
 * Deletes subscriptions that no device has saved, and no push service has accepted a push for, in
 * STALE_SUBSCRIPTION_DAYS: rows that nothing would otherwise remove, since only a push can find them gone.
 * The Alerts page saves once per visit and every accepted push sets lastSentAt, so a device in use stays.
 */
export async function pruneStaleSubscriptions(db: Db): Promise<number> {
  const cutoff = sql`now() - interval '${sql.raw(String(STALE_SUBSCRIPTION_DAYS))} days'`;
  const dropped = await db
    .delete(pushSubscriptions)
    .where(
      and(
        lt(pushSubscriptions.updatedAt, cutoff),
        or(isNull(pushSubscriptions.lastSentAt), lt(pushSubscriptions.lastSentAt, cutoff)),
      ),
    )
    .returning({ id: pushSubscriptions.id });
  return dropped.length;
}

export async function deleteSubscription(db: Db, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export type RotateResult =
  | "saved"
  /** No device is saved with the old endpoint. */
  | "unknown"
  /** As for a new device (UpsertResult): the old endpoint stays. */
  | "limited"
  | "refused"
  | "unavailable";

/**
 * Moves a device's settings to the endpoint the browser replaced it with. A new endpoint goes through the
 * same hourly limit and confirmation push as a new device (admitEndpoint): otherwise a client could move its
 * row to a made-up endpoint, sign up again, and repeat. The table needs no room: the row only moves.
 */
export async function rotateSubscription(
  db: Db,
  oldEndpoint: string,
  next: SubscribeInput["subscription"],
  checks: NewDeviceChecks,
): Promise<RotateResult> {
  if (oldEndpoint !== next.endpoint) {
    // A row may already exist for the new endpoint (e.g. the page re-saved first); the old row's settings win.
    const [old] = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, oldEndpoint));
    if (!old) return "unknown";
    const admitted = await admitEndpoint(db, next, checks, false);
    if (admitted !== "ok") return admitted === "full" ? "unavailable" : admitted;
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
  return updated.length > 0 ? "saved" : "unknown";
}
