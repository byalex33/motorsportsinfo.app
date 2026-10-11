import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

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
