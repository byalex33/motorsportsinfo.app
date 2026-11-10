// Push subscription endpoints for Session Reminders and Schedule Change pushes.
//   POST   { subscription, follows, leadMinutes, timeZone }  → save (upsert by endpoint). A new device is saved only
//          after the push service accepts a confirmation push to it (400 if refused, 503 if it can't be asked), and
//          at most NEW_DEVICES_PER_HOUR per client (429); 503 when full (MAX_SUBSCRIPTIONS). A selection of nothing
//          deletes the device, as DELETE does
//   DELETE { endpoint }                                       → turn off
//   PATCH  { oldEndpoint, subscription }                      → browser replaced the subscription (from the service worker).
//          A new endpoint gets the same confirmation push and hourly limit as a new device; 404 if the old one is unknown
import type { z } from "zod";
import { readCappedBody } from "@/app/api/csp-report/report";
import { getDb } from "@/db/client";
import { getVapidConfig, sendConfirmationPush, type VapidConfig } from "@/server/alerts/push";
import {
  clientKey,
  deleteSubscription,
  rotateSubscription,
  upsertSubscription,
  type NewDeviceChecks,
  type UpsertResult,
} from "@/server/alerts/subscriptions";
import { rotateSchema, subscribeSchema, unsubscribeSchema } from "@/server/alerts/validation";

const MAX_BODY_BYTES = 16 * 1024;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function noDatabase() {
  return json({ error: "Reminders are not available right now: the database is not configured." }, 503);
}

async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S> | Response> {
  let raw: unknown;
  try {
    // Stops reading past the limit, so a chunked body without a Content-Length is capped too.
    const text = await readCappedBody(request, MAX_BODY_BYTES);
    if (text === null) return json({ error: "Request body too large." }, 413);
    raw = JSON.parse(text);
  } catch {
    return json({ error: "Expected a JSON body." }, 400);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return json(
      { error: "Invalid request.", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      400,
    );
  }
  return parsed.data;
}

const REFUSALS: Record<Exclude<UpsertResult, "saved" | "removed">, [string, number]> = {
  full: ["Reminders are full right now: no new devices can sign up. Please try again later.", 503],
  limited: ["Too many new devices have signed up from your network in the last hour. Please try again later.", 429],
  refused: ["Your browser's push service did not accept this device. Turn alerts off and on again to make a new subscription.", 400],
  unavailable: ["Your browser's push service could not be reached just now. Please try again in a minute.", 503],
};

function newDeviceChecks(request: Request, vapid: VapidConfig): NewDeviceChecks {
  return {
    client: clientKey(request.headers, vapid.privateKey),
    confirm: (subscription) =>
      sendConfirmationPush({ endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth }, vapid),
  };
}

export async function POST(request: Request) {
  const input = await parseBody(request, subscribeSchema);
  if (input instanceof Response) return input;
  const db = getDb();
  if (!db) return noDatabase();
  const vapid = getVapidConfig();
  if (!vapid) return json({ error: "Reminders are not available right now: push is not configured." }, 503);
  const result = await upsertSubscription(db, input, newDeviceChecks(request, vapid));
  if (result === "saved" || result === "removed") return json({ ok: true });
  const [error, status] = REFUSALS[result];
  return json({ error }, status);
}

export async function DELETE(request: Request) {
  const input = await parseBody(request, unsubscribeSchema);
  if (input instanceof Response) return input;
  const db = getDb();
  if (!db) return noDatabase();
  await deleteSubscription(db, input.endpoint);
  return json({ ok: true });
}

export async function PATCH(request: Request) {
  const input = await parseBody(request, rotateSchema);
  if (input instanceof Response) return input;
  const db = getDb();
  if (!db) return noDatabase();
  const vapid = getVapidConfig();
  if (!vapid) return json({ error: "Reminders are not available right now: push is not configured." }, 503);
  const result = await rotateSubscription(db, input.oldEndpoint, input.subscription, newDeviceChecks(request, vapid));
  if (result === "saved") return json({ ok: true });
  if (result === "unknown") return json({ error: "Unknown subscription." }, 404);
  const [error, status] = REFUSALS[result];
  return json({ error }, status);
}
