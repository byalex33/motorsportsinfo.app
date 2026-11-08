// CONTRACT — owned by the schedule-data work. UI code imports only from here.
//
// With a database (DATABASE_URL set) reads come from the published schedule only, cached per Series
// and revalidated by the sync. Without one (local dev), or when the database can't be read (an outage,
// a spent quota), the sources are fetched live with the same parsers and memoised in-process for 15 minutes.
//
// When `now` is omitted the current time is read after `io()`, so under Cache Components the caller's
// component becomes request-time (wrap it in <Suspense>) instead of freezing the time into the shell.
import { io } from "next/cache";
import { getDb } from "@/db/client";
import { SERIES_IDS, type Circuit, type FeaturedRoundResult, type Round, type SeriesId, type Session } from "@/domain/types";
import { loadPublishedSchedule, loadRoundUpdatedAt, loadScheduleUpdatedAt } from "./db-read";
import { getLiveSchedule } from "./live";
import { selectCalendarSessions, selectFeaturedRound, selectScheduleRounds, selectUpcomingRounds, withCircuits, type UpcomingRound } from "./select";
import type { RoundWithContext } from "./types";

export { scheduleTag } from "./tags";
export type { UpcomingRound } from "./select";
export { listAnnouncements, type Announcement } from "./announcements";
export { getSpecialEvent, listSpecialEvents } from "./special-events";

async function loadRounds(series: SeriesId): Promise<RoundWithContext[]> {
  if (getDb()) {
    const published = await loadPublishedSchedule(series);
    if (published) return withCircuits(published);
    // The database can't be read: pages keep updating from the sources instead of serving their last render.
  }
  await io();
  return withCircuits(await getLiveSchedule(series));
}

/** Whether every Series' published schedule can be read: false without a database or while it is down. */
export async function isPublishedScheduleReadable(): Promise<boolean> {
  if (!getDb()) return false;
  const schedules = await Promise.all(SERIES_IDS.map((id) => loadPublishedSchedule(id)));
  return schedules.every((schedule) => schedule !== null);
}

async function resolveNow(now: Date | undefined): Promise<Date> {
  if (now) return now;
  await io();
  return new Date();
}

/** The Round a Series page shows: in progress, else next upcoming; held for 2h after its final Session. */
export async function getFeaturedRound(series: SeriesId, now?: Date): Promise<FeaturedRoundResult> {
  const rounds = await loadRounds(series);
  return selectFeaturedRound(rounds, await resolveNow(now));
}

/** Every Round of the Series that hasn't finished (held for 2h after its final Session), in calendar order. */
export async function listUpcomingRounds(series: SeriesId, now?: Date): Promise<UpcomingRound[]> {
  const rounds = await loadRounds(series);
  return selectUpcomingRounds(rounds, await resolveNow(now));
}

/** Every Round the schedule loaded for the Series, finished ones included, in calendar order. */
export async function listScheduleRounds(series: SeriesId): Promise<UpcomingRound[]> {
  return selectScheduleRounds(await loadRounds(series));
}

export interface SessionWithContext {
  session: Session;
  round: Round;
  circuit: Circuit;
}

/**
 * Sessions (including cancelled) for the given Series whose Round hasn't finished or finished in the last
 * 60 days, ordered by startsAt. Used by calendar feeds (calendar apps delete events that drop out of a
 * feed) and the FIA Document sync.
 */
export async function listCalendarSessions(series: SeriesId[], now?: Date): Promise<SessionWithContext[]> {
  const perSeries = await Promise.all(series.map((id) => loadRounds(id)));
  return selectCalendarSessions(perSeries.flat(), await resolveNow(now));
}

/**
 * When a Round's published schedule (the Round or any of its Sessions) last changed, as ISO UTC. Null
 * without a database, or when it can't be read: the live sources say nothing about when they changed.
 * Used for sitemap lastmod.
 */
export async function getRoundUpdatedAt(series: SeriesId, roundId: string): Promise<string | null> {
  return loadRoundUpdatedAt(series, roundId);
}

/**
 * When each of a Series' published Rounds last changed (the Round or any of its Sessions), keyed by
 * Round id, as ISO UTC. Empty without a database or when it can't be read. Used for sitemap lastmod.
 */
export async function getScheduleUpdatedAt(series: SeriesId): Promise<Record<string, string>> {
  return loadScheduleUpdatedAt(series);
}
