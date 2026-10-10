// Shared OpenF1 client (https://openf1.org) for Session Results and Telemetry. Free tier: 3 req/s,
// 30 req/min, data only after a Session ends. CC BY-NC-SA 4.0, credited "Data: OpenF1" (ADR 0001).
import { cacheLife } from "next/cache";
import type { Session } from "@/domain/types";
import { defaultContext, errorMessage, getJson } from "@/server/schedule/sources/http";
import type { OpenF1Session } from "@/server/schedule/sources/openf1";
import { matchOpenF1Session } from "./match";

export { matchOpenF1Session };

const BASE = "https://api.openf1.org/v1";

/** For lookups OpenF1 may simply not have yet: retried within minutes rather than cached for hours. */
export const OPENF1_PENDING_LIFE = { stale: 60, revalidate: 300, expire: 900 };

/**
 * GET an OpenF1 endpoint, e.g. `laps?session_key=11379`. Throws on HTTP errors (429 included). OpenF1
 * answers {"detail": "No results found."} instead of an empty list, so anything but an array is [].
 */
export async function openF1Get<T>(path: string): Promise<T[]> {
  const value = await getJson<unknown>(defaultContext, `${BASE}/${path}`);
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Waits between requests to OpenF1 so a burst stays inside the free tier. */
export function openF1Pause(): Promise<void> {
  return defaultContext.sleep(400);
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
