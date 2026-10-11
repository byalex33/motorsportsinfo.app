// GET /api/telemetry-sessions → { slugs: string[] }
// The Featured Round's F1 Sessions that have a Telemetry page, e.g. ["practice-1", …, "race"], for src/proxy.ts,
// which answers any other /f1/telemetry/… URL with a real 404. From the F1 page's cached data, so it is static
// and refreshes with it.
import { telemetrySlugs } from "@/app/[series]/telemetry/[session]/comparison";

export async function GET() {
  return Response.json(
    { slugs: await telemetrySlugs() },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
