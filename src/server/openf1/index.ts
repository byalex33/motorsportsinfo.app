// Shared OpenF1 client (https://openf1.org) for Session Results and Telemetry. Free tier: 3 req/s,
// 30 req/min, data only after a Session ends. CC BY-NC-SA 4.0, credited "Data: OpenF1" (ADR 0001).
import { cacheLife } from "next/cache";
import type { Session } from "@/domain/types";
import { defaultContext, errorMessage, getJson } from "@/server/schedule/sources/http";
import type { OpenF1Session } from "@/server/schedule/sources/openf1";
import { matchOpenF1Session } from "./match";
import { openF1Slot } from "./rate-limit";

export { matchOpenF1Session };

const BASE = "https://api.openf1.org/v1";

/** For lookups OpenF1 may simply not have yet: retried within minutes rather than cached for hours. */
export const OPENF1_PENDING_LIFE = { stale: 60, revalidate: 300, expire: 900 };

/**
 * The longest a page's OpenF1 request waits for its slot. Past that it fails like a 429 would (the caller
 * caches it as pending), well before a "use cache" fill's 50 s build timeout.
 */
const OPENF1_MAX_WAIT_MS = 20_000;

/**
 * GET an OpenF1 endpoint, e.g. `laps?session_key=11379`, in its turn in this instance's OpenF1 queue
 * (see rate-limit.ts), so parallel callers stay inside the free tier. Throws on HTTP errors (429
 * included) and when the queue is full. OpenF1 answers {"detail": "No results found."} instead of an
 * empty list, so anything but an array is [].
 */
export async function openF1Get<T>(path: string): Promise<T[]> {
  await openF1Slot(undefined, OPENF1_MAX_WAIT_MS);
  const value = await getJson<unknown>(defaultContext, `${BASE}/${path}`);
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * The season's OpenF1 Sessions, or null when OpenF1 could not be reached. Errors are caught inside the
 * cache scope: one escaping a `use cache` function fails the prerender even when the caller catches it.
 */
export async function openF1Sessions(season: number): Promise<OpenF1Session[] | null> {
  "use cache";
  try {
    const sessions = await openF1Get<OpenF1Session>(`sessions?year=${season}`);
    cacheLife("hours");
    return sessions;
  } catch (error) {
    console.warn(`[openf1] sessions unavailable for ${season}: ${errorMessage(error)}`);
    cacheLife(OPENF1_PENDING_LIFE);
    return null;
  }
}

/** The OpenF1 Session for one of ours, or null when OpenF1 has none (or could not be reached). */
export async function findOpenF1Session(season: number, session: Pick<Session, "type" | "startsAt">): Promise<OpenF1Session | null> {
  return matchOpenF1Session(session, (await openF1Sessions(season)) ?? []);
}
