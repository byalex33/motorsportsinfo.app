// Schedule sync cron (every 5 minutes, see vercel.ts). Requires `Authorization: Bearer ${CRON_SECRET}`.
// Also records new FIA Documents during an F1/F2/F3 Round, for Document Alerts (see server/documents/sync.ts).
// Manual runs: /api/cron/sync?series=f1&force=1 (series may be a comma-separated list).
import { revalidatePath, revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { SERIES_IDS, type SeriesId } from "@/domain/types";
import { fiaDocumentsTag, hasFiaDocuments, syncFiaDocuments, type DocumentsSyncResult } from "@/server/documents";
import { isCronRequest } from "@/server/cron";
import { scheduleTag } from "@/server/schedule";
import { syncSeries, type SyncResult } from "@/server/schedule/sync";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  if (!db) return Response.json({ error: "DATABASE_URL is not set" }, { status: 503 });

  const params = request.nextUrl.searchParams;
  const requested = params.get("series")?.split(",").map((s) => s.trim().toLowerCase());
  const unknown = requested?.filter((s) => !(SERIES_IDS as readonly string[]).includes(s)) ?? [];
  if (unknown.length > 0) return Response.json({ error: `Unknown series: ${unknown.join(", ")}` }, { status: 400 });
  const series = (requested ?? [...SERIES_IDS]) as SeriesId[];
  const force = params.get("force") === "1" || params.get("force") === "true";

  // Different hosts per Series, so they run in parallel; each source fetches its own pages sequentially.
  const results: SyncResult[] = await Promise.all(
    series.map((id) =>
      syncSeries(db, id, { force }).catch((error: unknown): SyncResult => {
        console.error(`[sync:${id}] failed`, error);
        return { series: id, status: "failed", published: false, error: error instanceof Error ? error.message : String(error) };
      }),
    ),
  );

  for (const r of results) {
    if (!r.published) continue;
    // Schedules must be correct on the next view (e.g. after a Schedule Change push), so no stale window.
    revalidateTag(scheduleTag(r.series), { expire: 0 });
    // "layout" covers the Series page and each Round page under /<series>/<season>/<round>.
    revalidatePath(`/${r.series}`, "layout");
  }
  if (results.some((r) => r.published)) revalidatePath("/calendar");

  // FIA Documents for Document Alerts, after the schedule so a just-published Round is watched. Never fails the sync.
  const now = new Date();
  const documents: DocumentsSyncResult[] = await Promise.all(
    series.filter(hasFiaDocuments).map((id) => syncFiaDocuments(db, id, now)),
  );
  for (const d of documents) {
    if (d.status !== "ok" || d.added === 0) continue;
    // The document a push opens should already be on the Series page and in the viewer.
    revalidateTag(fiaDocumentsTag(d.series), { expire: 0 });
    revalidatePath(`/${d.series}`, "layout");
  }
  if (results.some((r) => r.published) || documents.some((d) => d.status === "ok" && d.added > 0)) {
    revalidatePath("/sitemap.xml");
  }

  const failed = results.some((r) => r.status === "failed");
  return Response.json({ results, documents }, { status: failed ? 500 : 200 });
}
