// CONTRACT — owned by the schedule-data work. UI code imports only from here.
//
// With a database (DATABASE_URL set) reads come from the published schedule only, cached per Series
// and revalidated by the sync. Without one (local dev) the sources are fetched live with the same
// parsers and memoised in-process for 15 minutes.
//
// When `now` is omitted the current time is read after `io()`, so under Cache Components the caller's
// component becomes request-time (wrap it in <Suspense>) instead of freezing the time into the shell.
import { io } from "next/cache";
import { getDb } from "@/db/client";
import type { Circuit, FeaturedRoundResult, Round, SeriesId, Session } from "@/domain/types";
import { loadPublishedSchedule } from "./db-read";
import { getLiveSchedule } from "./live";
import { selectFeaturedRound, selectUpcomingSessions, withCircuits } from "./select";
import type { RoundWithContext } from "./types";

export { scheduleTag } from "./tags";

async function loadRounds(series: SeriesId): Promise<RoundWithContext[]> {
  if (getDb()) return withCircuits(await loadPublishedSchedule(series));
  await io();
  return withCircuits(await getLiveSchedule(series));
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

export interface SessionWithContext {
  session: Session;
  round: Round;
  circuit: Circuit;
}

/** Sessions (including cancelled) for the given Series whose Round has not finished, ordered by startsAt. Used by calendar feeds and alerts. */
export async function listUpcomingSessions(series: SeriesId[], now?: Date): Promise<SessionWithContext[]> {
  const perSeries = await Promise.all(series.map((id) => loadRounds(id)));
  return selectUpcomingSessions(perSeries.flat(), await resolveNow(now));
}
