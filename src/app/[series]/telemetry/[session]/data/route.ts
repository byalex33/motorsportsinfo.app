// The revealed Telemetry comparison: GET /f1/telemetry/{session}/data?a=VER&b=LEC (default: the top two).
// The page renders only the spoiler warning; once the viewer reveals it, the comparison is fetched from here,
// so laps and lap times are never in the page's HTML. Built from the same cached data as the page and the
// share image, so viewers never reach OpenF1 directly.
import type { TelemetryComparisonData } from "@/components/telemetry/telemetry-comparison";
import { canonicalTelemetryRedirect, DATA_QUERY_KEYS } from "../card";
import { resolveTelemetry } from "../comparison";

const SHORT = "public, max-age=60, s-maxage=60";

export async function GET(request: Request, ctx: RouteContext<"/[series]/telemetry/[session]/data">) {
  // Only the pair changes what is fetched; colours and the channel are applied in the browser. Any other
  // query (lowercase codes, extra parameters) goes to the canonical one first, so it is cached once.
  const redirect = canonicalTelemetryRedirect(request, DATA_QUERY_KEYS);
  if (redirect) return redirect;
  const { series, session: slug } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const view = await resolveTelemetry(series, slug, { a: searchParams.get("a") ?? undefined, b: searchParams.get("b") ?? undefined });
  if (view.kind === "not-found") return json({ error: "No such Telemetry" }, SHORT, 404);
  if (view.kind !== "ready") return json({ kind: view.kind } satisfies TelemetryComparisonData, SHORT);

  const { drivers, a, b, lapsA, lapsB, lapA, lapB, comparison, offPace } = view;
  const data: TelemetryComparisonData = { kind: "ready", drivers, a, b, lapsA, lapsB, lapA, lapB, comparison, offPace };
  // The laps behind it are cached for hours, as is the share image; car data still to come is retried soon.
  return json(data, comparison ? "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" : SHORT);
}

function json(body: unknown, cacheControl: string, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": cacheControl, "X-Robots-Tag": "noindex" } });
}
