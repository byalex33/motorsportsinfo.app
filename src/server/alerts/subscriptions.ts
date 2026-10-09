// Database writes for push subscriptions (subscribe / unsubscribe / browser rotation).
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { pushSubscriptions } from "@/db/schema";
import type { SubscribeInput } from "./validation";

export async function upsertSubscription(db: Db, input: SubscribeInput): Promise<void> {
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
