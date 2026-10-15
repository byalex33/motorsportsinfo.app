// Calendar feed: GET /calendar/{selection}.ics, e.g. /calendar/f1-q-r_wec-h-r.ics
// The selection lives in the URL (see encodeSelection) — no account, no database row.
import { buildCalendarFeed } from "@/server/alerts/feed";
import { parseCalendarSegment } from "@/server/alerts/selection";

/** CDN cache ~15 min; serve stale for up to an hour while refreshing. */
const CACHE_CONTROL = "public, max-age=900, s-maxage=900, stale-while-revalidate=3600";

export async function GET(_request: Request, ctx: RouteContext<"/calendar/[spec]">) {
  // Already percent-decoded by the router; decoding again would throw on a literal "%".
  const { spec } = await ctx.params;
  const follows = parseCalendarSegment(spec);
  if (!follows) {
    return new Response("Unknown calendar feed. Build a new link at https://motorsportsinfo.app/alerts\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
    });
  }

  const body = await buildCalendarFeed(follows);
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="motorsportsinfo.ics"',
      "Cache-Control": CACHE_CONTROL,
      // Personal feeds for calendar apps, not pages for search results.
      "X-Robots-Tag": "noindex",
    },
  });
}
