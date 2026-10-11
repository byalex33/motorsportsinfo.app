// GET /api/status → sync health as JSON, for an uptime monitor. Requires `Authorization: Bearer ${CRON_SECRET}`.
// 200 when healthy; 503 when a Schedule Flag is open or a Series has not synced successfully in 26 hours.
import { getDb } from "@/db/client";
import { isCronRequest } from "@/server/cron";
import { getSyncStatus } from "@/server/status";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!isCronRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers });

  const db = getDb();
  if (!db) return Response.json({ ok: false, error: "DATABASE_URL is not set" }, { status: 503, headers });

  const status = await getSyncStatus(db);
  return Response.json(status, { status: status.ok ? 200 : 503, headers });
}
