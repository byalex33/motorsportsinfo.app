// CONTRACT — owned by the telemetry work. UI code imports Telemetry only from here.
// F1 only, from OpenF1 after a Session ends ("Data: OpenF1" — ADR 0001). Everything is cached on our side:
// a Session's laps for an hour, a lap's car data for days (it never changes), so viewers never reach
// OpenF1's 30 req/min free tier directly.
import { cacheLife } from "next/cache";
import type { LapComparison, Session, SessionTelemetry, TelemetryLap } from "@/domain/types";
import { findOpenF1Session, openF1Get, openF1Pause, OPENF1_PENDING_LIFE } from "@/server/openf1";
import { errorMessage } from "@/server/schedule/sources/http";
import { compareLaps } from "./compare";
import {
  fastestLap,
  parseSessionTelemetry,
  type OpenF1CarData,
  type OpenF1Classified,
  type OpenF1Lap,
  type OpenF1Location,
  type OpenF1TelemetryDriver,
} from "./openf1";

export { fastestLap };

export type SessionTelemetryResult =
  | { kind: "ready"; sessionKey: number; telemetry: SessionTelemetry }
  /** OpenF1 has no laps for this Session yet, or could not be reached. */
  | { kind: "unavailable" };

/** Every driver's laps in a finished F1 Session. Never throws. */
export async function getSessionTelemetry(season: number, session: Pick<Session, "type" | "startsAt">): Promise<SessionTelemetryResult> {
  return cachedSessionTelemetry(season, session.type, session.startsAt);
}

// Errors are caught inside the cache scope: one escaping a `use cache` function fails the render even
// when the caller catches it.
async function cachedSessionTelemetry(season: number, type: Session["type"], startsAt: string): Promise<SessionTelemetryResult> {
  "use cache";
  const match = await findOpenF1Session(season, { type, startsAt });
  if (!match) {
    cacheLife(OPENF1_PENDING_LIFE);
    return { kind: "unavailable" };
  }
  const key = match.session_key;
  try {
    const laps = await openF1Get<OpenF1Lap>(`laps?session_key=${key}`);
    await openF1Pause();
    const drivers = await openF1Get<OpenF1TelemetryDriver>(`drivers?session_key=${key}`);
    await openF1Pause();
    const classification = await openF1Get<OpenF1Classified>(`session_result?session_key=${key}`);
    if (laps.length === 0 || drivers.length === 0) {
      cacheLife(OPENF1_PENDING_LIFE);
      return { kind: "unavailable" };
    }
    // The classification can still change (penalties), so this is re-read hourly.
    if (classification.length > 0) cacheLife("hours");
    else cacheLife(OPENF1_PENDING_LIFE);
    return { kind: "ready", sessionKey: key, telemetry: parseSessionTelemetry(laps, drivers, classification) };
  } catch (error) {
    console.warn(`[telemetry] OpenF1 laps unavailable for session ${key}: ${errorMessage(error)}`);
    cacheLife(OPENF1_PENDING_LIFE);
    return { kind: "unavailable" };
  }
}

export interface ComparedLap {
  driver: number;
  lap: TelemetryLap;
}

/**
 * Two laps lined up by distance, or null when either lap's car data can't be had. The laps are fetched one
 * after the other (each cached on its own, so changing one driver reuses the other). Never throws.
 */
export async function getLapComparison(sessionKey: number, a: ComparedLap, b: ComparedLap): Promise<LapComparison | null> {
  if (a.lap.time === null || !a.lap.startsAt || b.lap.time === null || !b.lap.startsAt) return null;
  const lapA = await lapData(sessionKey, a.driver, a.lap.startsAt, a.lap.time);
  const lapB = await lapData(sessionKey, b.driver, b.lap.startsAt, b.lap.time);
  if (!lapA || !lapB) return null;
  return compareLaps(
    { lap: a.lap.lap, time: a.lap.time, startsAt: a.lap.startsAt, ...lapA },
    { lap: b.lap.lap, time: b.lap.time, startsAt: b.lap.startsAt, ...lapB },
  );
}

interface LapData {
  car: OpenF1CarData[];
  location: OpenF1Location[];
}

async function lapData(sessionKey: number, driver: number, startsAt: string, time: number): Promise<LapData | null> {
  "use cache";
  // A second either side, so the samples around the line are there to interpolate from.
  const from = encodeURIComponent(new Date(Date.parse(startsAt) - 1000).toISOString());
  const to = encodeURIComponent(new Date(Date.parse(startsAt) + (time + 1) * 1000).toISOString());
  const window = `session_key=${sessionKey}&driver_number=${driver}&date%3E%3D${from}&date%3C%3D${to}`;
  try {
    await openF1Pause();
    const car = await openF1Get<OpenF1CarData>(`car_data?${window}`);
    await openF1Pause();
    const location = await openF1Get<OpenF1Location>(`location?${window}`);
    if (car.length === 0) {
      cacheLife(OPENF1_PENDING_LIFE);
      return null;
    }
    cacheLife("days");
    return { car, location };
  } catch (error) {
    console.warn(`[telemetry] OpenF1 car data unavailable for session ${sessionKey}, car ${driver}: ${errorMessage(error)}`);
    cacheLife(OPENF1_PENDING_LIFE);
    return null;
  }
}
