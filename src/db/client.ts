import "server-only";
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { UPSTREAM_ATTEMPT_MS, withDeadline } from "@/server/deadline";
import * as schema from "./schema";

// A query that never returns would hold a `use cache` fill until the prerender gives up. The deadline
// rejects the caller; cache: no-store keeps Next from caching the SQL response (caching is use cache).
neonConfig.fetchFunction = (input: RequestInfo | URL, init?: RequestInit) =>
  withDeadline(
    (async () => {
      const res = await fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(UPSTREAM_ATTEMPT_MS) });
      // Buffer here so a body that never finishes is the same timeout as a socket that never connects.
      const body = await res.arrayBuffer();
      return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
    })(),
    UPSTREAM_ATTEMPT_MS,
    "database",
  );

export type Db = ReturnType<typeof createDb>;

function createDb(url: string) {
  // Neon's HTTP driver queries over fetch(); without no-store, Next's fetch cache would keep serving
  // stale query results across requests and even builds. Caching is done one level up with "use cache".
  return drizzle(neon(url, { fetchOptions: { cache: "no-store" } }), { schema });
}

let cached: Db | null | undefined;

/** Returns null when DATABASE_URL is not set (local dev without a database). */
export function getDb(): Db | null {
  if (cached === undefined) {
    const url = process.env.DATABASE_URL;
    cached = url ? createDb(url) : null;
  }
  return cached;
}
