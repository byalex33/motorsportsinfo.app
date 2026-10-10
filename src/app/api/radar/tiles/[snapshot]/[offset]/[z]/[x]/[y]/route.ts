// GET /api/radar/tiles/{snapshot}/{offset}/{z}/{x}/{y} → PNG
// Relays one Rainbow.ai forecast rain tile so the API key stays on the server. Only tiles near a Circuit,
// in the forecast window and at the map's zooms are fetched (see parseForecastTile).
import { forecastTileFromParams, getForecastTile } from "@/server/radar";

const text = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=60, s-maxage=60" },
  });

export async function GET(_request: Request, ctx: RouteContext<"/api/radar/tiles/[snapshot]/[offset]/[z]/[x]/[y]">) {
  const tile = forecastTileFromParams(await ctx.params);
  if (!tile) return text("No such radar tile.\n", 404);

  const result = await getForecastTile(tile);
  if (result.kind === "not-found") return text("No such radar tile.\n", 404);
  if (result.kind === "unavailable") return text("Forecast radar unavailable.\n", 503);

  return new Response(result.png as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "image/png",
      // A tile for a given snapshot and offset never changes; Rainbow only keeps snapshots for 2 hours.
      "Cache-Control": "public, max-age=7200, s-maxage=7200, immutable",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
