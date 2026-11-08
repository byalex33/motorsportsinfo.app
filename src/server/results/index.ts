// CONTRACT — owned by the results work. UI code imports Session Results only from here.
// F1 only, from OpenF1 ("Data: OpenF1" is already credited on the F1 page — ADR 0001). Other Series link to
// their official results page instead (officialResultsUrl in src/domain/series.ts).
import { cacheLife } from "next/cache";
import type { SeriesId, Session, SessionResult } from "@/domain/types";
import { UPSTREAM_BUDGET_MS, withDeadline } from "@/server/deadline";
import { matchOpenF1Session, openF1Get, openF1Sessions, OPENF1_PENDING_LIFE } from "@/server/openf1";
import { errorMessage } from "@/server/schedule/sources/http";
import { parseOpenF1Result, type OpenF1Driver, type OpenF1SessionResult } from "./openf1";

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
  // Sessions, then results, then drivers: three reads in this one fill. Each may take the source
  // timeout, which together is longer than a prerender allows, so they share one budget.
  let out: Record<string, SessionResult>;
  try {
    out = await withDeadline(loadF1Results(season, sessions), UPSTREAM_BUDGET_MS, "OpenF1 results");
  } catch (error) {
    console.warn(`[results] OpenF1 results unavailable for ${season}: ${errorMessage(error)}`);
    cacheLife(OPENF1_PENDING_LIFE);
    return {};
  }
  // Results can still change after the fact (penalties), so even a complete set is re-read hourly.
  if (Object.keys(out).length === sessions.length) cacheLife("hours");
  else cacheLife(OPENF1_PENDING_LIFE);
  return out;
}

async function loadF1Results(season: number, sessions: ResultSession[]): Promise<Record<string, SessionResult>> {
  const candidates = (await openF1Sessions(season)) ?? [];
  const matched = sessions.flatMap((session) => {
    const match = matchOpenF1Session(session, candidates);
    return match ? [{ session, key: match.session_key, meeting: match.meeting_key }] : [];
  });
  if (matched.length === 0) return {};

  const meeting = matched[0].meeting;
  const results = await openF1Get<OpenF1SessionResult>(`session_result?meeting_key=${meeting}`);
  const drivers = await openF1Get<OpenF1Driver>(`drivers?meeting_key=${meeting}`);

  const out: Record<string, SessionResult> = {};
  for (const { session, key } of matched) {
    const result = parseOpenF1Result(key, results, drivers);
    if (result) out[session.id] = result;
  }
  return out;
}
