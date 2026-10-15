// Every minute (vercel.ts): due Session Reminders, unsent Schedule Change pushes and Document Alerts, and at 07:00 UTC
// the owner's sync alert (OWNER_PUSH_ENDPOINT). Reads the database only.
import { getDb } from "@/db/client";
import { getVapidConfig } from "@/server/alerts/push";
import { runAlerts } from "@/server/alerts/run";
import { isCronRequest } from "@/server/cron";

// runAlerts stops claiming work RUN_BUDGET_MS (45 s) in, so what it claimed can still be sent within this.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  if (!db) return Response.json({ skipped: "DATABASE_URL is not set" });
  const vapid = getVapidConfig();
  if (!vapid) return Response.json({ skipped: "VAPID keys are not set" });

  const result = await runAlerts(db, vapid);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
