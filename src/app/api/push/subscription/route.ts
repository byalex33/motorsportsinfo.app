// Push subscription endpoints for Session Reminders and Schedule Change pushes.
//   POST   { subscription, follows, leadMinutes, timeZone }  → save (upsert by endpoint)
//   DELETE { endpoint }                                       → turn off
//   PATCH  { oldEndpoint, subscription }                      → browser replaced the subscription (from the service worker)
import type { z } from "zod";
import { getDb } from "@/db/client";
import { deleteSubscription, rotateSubscription, upsertSubscription } from "@/server/alerts/subscriptions";
import { rotateSchema, subscribeSchema, unsubscribeSchema } from "@/server/alerts/validation";

const MAX_BODY_BYTES = 16 * 1024;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function noDatabase() {
  return json({ error: "Reminders are not available right now: the database is not configured." }, 503);
}

async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S> | Response> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return json({ error: "Request body too large." }, 413);
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: "Request body too large." }, 413);
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

export async function POST(request: Request) {
  const input = await parseBody(request, subscribeSchema);
  if (input instanceof Response) return input;
  const db = getDb();
  if (!db) return noDatabase();
  await upsertSubscription(db, input);
  return json({ ok: true });
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
  const found = await rotateSubscription(db, input.oldEndpoint, input.subscription);
  return found ? json({ ok: true }) : json({ error: "Unknown subscription." }, 404);
}
