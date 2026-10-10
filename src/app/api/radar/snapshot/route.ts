// GET /api/radar/snapshot → { snapshot: number | null }
// The latest Rainbow.ai forecast snapshot for the rain radar; null means "use the past radar instead".
import { connection } from "next/server";
import { getForecastSnapshot } from "@/server/radar";

export async function GET() {
  await connection();
  const snapshot = await getForecastSnapshot();
  // Rainbow publishes a snapshot every 10 minutes; a minute at the CDN keeps upstream calls rare.
  return Response.json(
    { snapshot },
    { headers: { "Cache-Control": `public, max-age=60, s-maxage=${snapshot === null ? 60 : 120}` } },
  );
}
