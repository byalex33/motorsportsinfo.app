// Which preview card a Telemetry link gets. The comparison image shows lap times and who was quicker, so only
// a link that names both drivers (what the share buttons post) gets it. A bare link, pasted from the address
// bar or reached from the TELEMETRY chip, would otherwise give the result away to everyone in a chat before
// they choose to look.
// Also the one spelling of the share image's and the comparison data's query: both redirect any other to it,
// so made-up parameters can't make the CDN miss and the server render again. Colour picks are snapped to a
// 4,096-colour palette, and a driver code the Session doesn't have is dropped (unknownDriverRedirect).
import { colorParam } from "@/lib/team-colors";
import { channelParam } from "@/lib/telemetry-channels";

type Query = Record<string, string | string[] | undefined>;

/** The query keys a Telemetry URL understands, in the order a canonical query lists them. */
export type TelemetryQueryKey = "a" | "b" | "ca" | "cb" | "ch";
const KEY_ORDER: readonly TelemetryQueryKey[] = ["a", "b", "ca", "cb", "ch"];

/** The share image's query keys: the pair, its colours and the channel. */
export const IMAGE_QUERY_KEYS = KEY_ORDER;
/** The comparison data's query keys: only the pair changes what is fetched. */
export const DATA_QUERY_KEYS: readonly TelemetryQueryKey[] = ["a", "b"];

/**
 * The query with only `keys`, each valid and in one spelling, in a fixed order (?a=VER&b=LEC&ca=ff00aa&cb=…
 * &ch=throttle). Driver codes are uppercased, colours lowercased without "#", and the default channel (speed)
 * left out, as is anything invalid and any other key.
 */
export function canonicalTelemetryQuery(query: Query, keys: readonly TelemetryQueryKey[]): URLSearchParams {
  const canonical = new URLSearchParams();
  for (const key of KEY_ORDER) {
    if (!keys.includes(key)) continue;
    const value = query[key];
    if (key === "a" || key === "b") {
      if (isDriverCode(value)) canonical.set(key, value.toUpperCase());
    } else if (key === "ch") {
      const channel = channelParam(value);
      if (channel !== "speed") canonical.set(key, channel);
    } else {
      const color = colorParam(value);
      if (color) canonical.set(key, paletteColor(color));
    }
  }
  return canonical;
}

/** The same URL with its canonical query, or null when it already has it. */
export function canonicalTelemetryUrl(url: URL, keys: readonly TelemetryQueryKey[]): URL | null {
  const query = canonicalTelemetryQuery(Object.fromEntries(url.searchParams), keys).toString();
  if (url.search === (query ? `?${query}` : "")) return null;
  const canonical = new URL(url);
  canonical.search = query;
  return canonical;
}

/** A permanent redirect to the request's canonical URL, or null when it already is canonical. */
export function canonicalTelemetryRedirect(request: Request, keys: readonly TelemetryQueryKey[]): Response | null {
  const canonical = canonicalTelemetryUrl(new URL(request.url), keys);
  if (!canonical) return null;
  return new Response(null, {
    status: 308,
    headers: { Location: canonical.pathname + canonical.search, "Cache-Control": "public, max-age=3600", "X-Robots-Tag": "noindex" },
  });
}

/**
 * A 308 to the same URL without `a` or `b` when it names a driver the comparison didn't resolve to (a made-up
 * or absent code, which falls back to the default pair), or null. Called after resolveTelemetry, so any
 * three letters can't each make a new CDN entry for the same comparison.
 */
export function unknownDriverRedirect(request: Request, resolved: { a: string; b: string }): Response | null {
  const url = new URL(request.url);
  let changed = false;
  for (const key of ["a", "b"] as const) {
    const value = url.searchParams.get(key);
    if (value !== null && value.toUpperCase() !== resolved[key]) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) return null;
  const search = url.searchParams.toString();
  return new Response(null, {
    status: 308,
    headers: { Location: url.pathname + (search ? `?${search}` : ""), "Cache-Control": "public, max-age=3600", "X-Robots-Tag": "noindex" },
  });
}

/**
 * "#e8002d" as the nearest colour whose channels are each a doubled hex digit ("ee0033"). At most 8/255 off
 * per channel, which no one sees on a chart line, and 4,096 colours instead of 16.7 million.
 */
function paletteColor(color: string): string {
  return [1, 3, 5].map((i) => (Math.round(parseInt(color.slice(i, i + 2), 16) / 17) * 0x11).toString(16).padStart(2, "0")).join("");
}

/** The share image's query for a link that names both drivers (?a=VER&b=LEC, with its colours and channel), else null. */
export function comparisonCardQuery(query: Query): URLSearchParams | null {
  if (!isDriverCode(query.a) || !isDriverCode(query.b)) return null;
  return canonicalTelemetryQuery(query, IMAGE_QUERY_KEYS);
}

function isDriverCode(value: Query[string]): value is string {
  return typeof value === "string" && /^[a-z]{3}$/i.test(value);
}
