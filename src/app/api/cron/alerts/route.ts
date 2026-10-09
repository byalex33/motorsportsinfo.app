// Every minute (vercel.ts): due Session Reminders, unsent Schedule Change pushes and Document Alerts. Reads the database only.
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db/client";
import { getVapidConfig } from "@/server/alerts/push";
import { runAlerts } from "@/server/alerts/run";

export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  if (!db) return Response.json({ skipped: "DATABASE_URL is not set" });
  const vapid = getVapidConfig();
  if (!vapid) return Response.json({ skipped: "VAPID keys are not set" });

  const result = await runAlerts(db, vapid);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
