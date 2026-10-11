// GET /api/results/{series}/{session}, e.g. /api/results/f1/qualifying → SessionResult
// One finished Session's Session Result, for the Results modal once the viewer chooses to see it. The Series
// page only says which Sessions have one, so the classification (a spoiler) is never in its HTML. Read from
// the same cached lookup as the page, so viewers never reach OpenF1 directly.
import { connection } from "next/server";
import { isSeriesId } from "@/lib/series-id";
import { sessionSlug } from "@/lib/session-slug";
import { getSessionResults } from "@/server/results";
import { finishedSessions, getSeriesPageData } from "@/app/[series]/data";

const NOINDEX = { "X-Robots-Tag": "noindex" };

export async function GET(_request: Request, ctx: RouteContext<"/api/results/[series]/[session]">) {
  const { series, session: slug } = await ctx.params;
  if (!isSeriesId(series)) return notFound();
  const { featured } = await getSeriesPageData(series);
  if (featured.kind !== "round" || !featured.round.sessionTimesConfirmed) return notFound();

  await connection();
  const finished = finishedSessions(featured.sessions, Date.now());
  const session = finished.find((s) => sessionSlug(s) === slug);
  if (!session) return notFound();

  const result = (await getSessionResults(series, featured.round.season, finished))[session.id];
  // Not published yet (or not a Series with results): the modal links to the official results instead.
  if (!result) return notFound();
  // Penalties can still change a classification; the lookup behind it is re-read hourly.
  return Response.json(result, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=3600", ...NOINDEX },
  });
}

function notFound() {
  return Response.json({ error: "No Session Result" }, { status: 404, headers: { "Cache-Control": "public, max-age=60, s-maxage=60", ...NOINDEX } });
}
