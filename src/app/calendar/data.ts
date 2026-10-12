import { cacheLife, cacheTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { circuitCountry } from "@/data/circuits";
import { getDb } from "@/db/client";
import { SERIES_IDS, type SeriesId, type Session } from "@/domain/types";
import { circuitCountryCode, type CountryCode } from "@/lib/country-code";
import { roundShortName } from "@/lib/seo/json-ld";
import { formatRoundDates } from "@/lib/time-format";
import { trackTimeText } from "@/lib/track-time";
import { listUpcomingRounds, scheduleTag, type UpcomingRound } from "@/server/schedule";

export type CalendarSession = Pick<Session, "id" | "name" | "type" | "startsAt" | "endsAt" | "status">;

/** Track Time text for a Session start, shown until the client knows the viewer's zone. */
export interface CalendarTrackTime {
  /** "Sun 11" */
  day: string;
  /** "13:00" */
  clock: string;
  /** "GMT+8" */
  offset: string;
}

/** One card on the calendar: a Round that hasn't finished, as plain data for the client. */
export interface CalendarRound {
  id: string;
  series: SeriesId;
  /** "Singapore Grand Prix", "Round 13 · Baku". */
  name: string;
  /** null for a Round the Series doesn't number (NASCAR's exhibition races). */
  roundNumber: number | null;
  season: number;
  circuitName: string;
  /** "Marina Bay, Singapore". */
  location: string;
  country: string;
  countryCode: CountryCode | null;
  circuitTimeZone: string;
  /** "9–11 Oct 2026", in Track Time. */
  dates: string;
  /** First day, YYYY-MM-DD in Track Time. Cards are grouped by its month. */
  startDate: string;
  /** False while the Round's Session times are TBC (then `sessions` is empty). */
  timesConfirmed: boolean;
  /** Every Session is cancelled. */
  cancelled: boolean;
  /** The Series' Featured Round, the one its Series page shows. */
  featured: boolean;
  /** An F1 sprint weekend: the Round has a Sprint that isn't cancelled. Other Series race a Sprint every Round. */
  sprint: boolean;
  /** Ordered by start; cancelled Sessions included. */
  sessions: CalendarSession[];
  trackTimes: Record<string, CalendarTrackTime>;
}

export interface CalendarPageData {
  /** Every unfinished Round of every Series, in calendar order. */
  rounds: CalendarRound[];
  /** Series whose schedule couldn't be read (local dev without a database only). */
  unavailable: SeriesId[];
  renderedAt: string;
}

function toCalendarRound({ round, roundNumber, circuit, sessions }: UpcomingRound, featured: boolean): CalendarRound {
  const timed = round.sessionTimesConfirmed ? sessions : [];
  const trackTimes: Record<string, CalendarTrackTime> = {};
  for (const s of timed) {
    const { weekday, day, clock, offset } = trackTimeText(s, circuit.timeZone);
    trackTimes[s.id] = { day: `${weekday} ${day}`, clock, offset };
  }
  return {
    id: round.id,
    series: round.series,
    name: roundShortName(round, circuit),
    roundNumber,
    season: round.season,
    circuitName: circuit.name,
    location: circuit.location,
    country: circuitCountry(circuit),
    countryCode: circuitCountryCode(circuit),
    circuitTimeZone: circuit.timeZone,
    dates: formatRoundDates(round.startDate, round.endDate),
    startDate: round.startDate,
    timesConfirmed: round.sessionTimesConfirmed,
    cancelled: allCancelled(sessions),
    featured,
    sprint: round.series === "f1" && timed.some((s) => s.type === "sprint" && s.status !== "cancelled"),
    sessions: timed.map(({ id, name, type, startsAt, endsAt, status }) => ({ id, name, type, startsAt, endsAt, status })),
    trackTimes,
  };
}

const allCancelled = (sessions: Session[]) => sessions.length > 0 && sessions.every((s) => s.status === "cancelled");

/**
 * The full calendar, cached like the Series pages (~5 minutes) and tagged with every Series' schedule, so
 * the schedule sync refreshes it straight away.
 */
export async function getCalendarPageData(): Promise<CalendarPageData> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 86_400 });
  cacheTag(...SERIES_IDS.map((id) => scheduleTag(id)));

  const rounds: CalendarRound[] = [];
  const unavailable: SeriesId[] = [];
  // One Series at a time, as on the home page: a "use cache" scope must not await another scope's fetch.
  for (const series of SERIES_IDS) {
    try {
      const upcoming = await listUpcomingRounds(series);
      // The Featured Round: the first unfinished Round not wholly cancelled (as selectFeaturedRound).
      const featured = upcoming.find((r) => !allCancelled(r.sessions));
      rounds.push(...upcoming.map((r) => toCalendarRound(r, r === featured)));
    } catch (error) {
      unstable_rethrow(error);
      // Same rule as the Series pages: with a database a failed read throws so the last good page stays.
      if (getDb()) throw error;
      console.warn(`[calendar:${series}] schedule unavailable: ${error instanceof Error ? error.message : String(error)}`);
      unavailable.push(series);
    }
  }
  // By first day, then first Session start (a Round without times sorts first on its day).
  rounds.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      (a.sessions[0]?.startsAt ?? "").localeCompare(b.sessions[0]?.startsAt ?? "") ||
      a.id.localeCompare(b.id),
  );
  return { rounds, unavailable, renderedAt: new Date().toISOString() };
}
