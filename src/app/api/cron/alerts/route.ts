// Every minute (vercel.ts): due Session Reminders, unsent Schedule Change pushes and Document Alerts, and at 07:00 UTC
// the owner's sync alert (OWNER_PUSH_ENDPOINT). Reads the database only, and only when the remote cache says
// something may be due: most minutes nothing is, and the database can then scale to zero.
import { revalidateTag } from "next/cache";
import { getDb } from "@/db/client";
import { getVapidConfig } from "@/server/alerts/push";
import { runAlerts } from "@/server/alerts/run";
import { UNSENT_PUSHES_TAG, planAlertsRun } from "@/server/alerts/wake";
import { isCronRequest } from "@/server/cron";

// runAlerts stops claiming work RUN_BUDGET_MS (45 s) in, so what it claimed can still be sent within this, and
// its claims last CLAIM_LEASE_MS, this long: work a run claimed but never finished is taken again after it.
// Runs started a minute apart may overlap; their claims keep them from sending the same push.
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  if (!db) return Response.json({ skipped: "DATABASE_URL is not set" });
  const vapid = getVapidConfig();
  if (!vapid) return Response.json({ skipped: "VAPID keys are not set" });

  const now = new Date();
  const work = await planAlertsRun(now);
  if (!work.reminders && !work.pushes && !work.daily) {
    return Response.json({ skipped: "nothing due" }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await runAlerts(db, vapid, now, { work });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } finally {
    // Asked again next minute: anything left (out of time, a failed read) is then still found.
    if (work.pushes) revalidateTag(UNSENT_PUSHES_TAG, { expire: 0 });
  }
}
