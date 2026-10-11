// Telemetry URLs for a Session that isn't there (/f1/telemetry/nope, or any other Series) get a real 404.
// The Telemetry page can't refuse them itself: it renders at request time (its preview card reads the query),
// so the App Shell has been sent with a 200 before the page knows its slug, and every garbage URL would be a
// new cached success at the CDN. The valid slugs, the Featured Round's Sessions, come from the app's own
// static /api/telemetry-sessions, remembered here for a minute.
import { NextResponse, type NextRequest } from "next/server";

export const config = { matcher: "/:series/telemetry/:session" };

const FRESH_MS = 60_000;
let known: { slugs: Set<string>; until: number } | null = null;

export async function proxy(request: NextRequest) {
  const [, series, , slug] = request.nextUrl.pathname.split("/");
  if (series === "f1") {
    const slugs = await telemetrySlugs(request);
    // When the list can't be had, let the page decide (it shows the not-found page, with a 200).
    if (!slugs || slugs.has(slug)) return NextResponse.next();
  }
  return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
}

async function telemetrySlugs(request: NextRequest): Promise<Set<string> | null> {
  if (known && known.until > Date.now()) return known.slugs;
  try {
    const res = await fetch(new URL("/api/telemetry-sessions", request.url), { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const { slugs } = (await res.json()) as { slugs: string[] };
    known = { slugs: new Set(slugs), until: Date.now() + FRESH_MS };
    return known.slugs;
  } catch {
    return null;
  }
}
