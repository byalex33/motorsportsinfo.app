// CONTRACT — owned by the results work. UI code imports Session Results only from here.
// F1 only, from OpenF1 ("Data: OpenF1" is already credited on the F1 page — ADR 0001). Other Series link to
// their official results page instead (officialResultsUrl in src/domain/series.ts).
import { cacheLife } from "next/cache";
import type { SeriesId, Session, SessionResult } from "@/domain/types";
import type { OpenF1Session } from "@/server/schedule/sources/openf1";
import { defaultContext, errorMessage, getJson } from "@/server/schedule/sources/http";
import { matchOpenF1Session, parseOpenF1Result, type OpenF1Driver, type OpenF1SessionResult } from "./openf1";

const BASE = "https://api.openf1.org/v1";
/** OpenF1 posts a classification some minutes after a Session ends, so a miss is retried soon. */
const PENDING_LIFE = { stale: 60, revalidate: 300, expire: 900 };

type ResultSession = Pick<Session, "id" | "type" | "startsAt">;

/**
 * Session Results for a Round's finished Sessions, keyed by Session id. Sessions without one (no source
 * for the Series, or OpenF1 has not published it yet) are missing. Never throws.
 */
export async function getSessionResults(series: SeriesId, season: number, finished: Session[]): Promise<Record<string, SessionResult>> {
  if (series !== "f1" || finished.length === 0) return {};
  return cachedF1Results(
    season,
    finished.map(({ id, type, startsAt }) => ({ id, type, startsAt })),
  );
}

// Keyed by the finished Sessions, so each Session that finishes starts a fresh lookup. Two requests per
// Round (results and drivers for the whole meeting) keep well inside OpenF1's 3 req/s free tier.
// Errors are caught inside the cache scope (as in the weather module): one escaping a `use cache`
// function fails the prerender even when the caller catches it, and OpenF1 does answer 429 at build time.
async function cachedF1Results(season: number, sessions: ResultSession[]): Promise<Record<string, SessionResult>> {
  "use cache";
  const candidates = (await openF1Sessions(season)) ?? [];
  const matched = sessions.flatMap((session) => {
    const match = matchOpenF1Session(session, candidates);
    return match ? [{ session, key: match.session_key, meeting: match.meeting_key }] : [];
  });
  if (matched.length === 0) {
    cacheLife(PENDING_LIFE);
    return {};
  }

  const meeting = matched[0].meeting;
  let results: OpenF1SessionResult[];
  let drivers: OpenF1Driver[];
  try {
    await defaultContext.sleep(400);
    results = asArray(await getJson(defaultContext, `${BASE}/session_result?meeting_key=${meeting}`));
    await defaultContext.sleep(400);
    drivers = asArray(await getJson(defaultContext, `${BASE}/drivers?meeting_key=${meeting}`));
  } catch (error) {
    console.warn(`[results] OpenF1 results unavailable for meeting ${meeting}: ${errorMessage(error)}`);
    cacheLife(PENDING_LIFE);
    return {};
  }

  const out: Record<string, SessionResult> = {};
  for (const { session, key } of matched) {
    const result = parseOpenF1Result(key, results, drivers);
    if (result) out[session.id] = result;
  }
  // Results can still change after the fact (penalties), so even a complete set is re-read hourly.
  if (Object.keys(out).length === sessions.length) cacheLife("hours");
  else cacheLife(PENDING_LIFE);
  return out;
}

/** null when OpenF1 could not be reached; retried soon rather than cached for hours. */
async function openF1Sessions(season: number): Promise<OpenF1Session[] | null> {
  "use cache";
  try {
    const sessions = asArray<OpenF1Session>(await getJson(defaultContext, `${BASE}/sessions?year=${season}`));
    cacheLife("hours");
    return sessions;
  } catch (error) {
    console.warn(`[results] OpenF1 sessions unavailable for ${season}: ${errorMessage(error)}`);
    cacheLife(PENDING_LIFE);
    return null;
  }
}

// OpenF1 answers {"detail": "No results found."} instead of an empty list.
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
