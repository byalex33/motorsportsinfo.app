// The home page's one-line view of each Series: its Featured Round and the Session to watch next.
// Built on the server from the same cached data as the Series pages; the Viewer Time text and the
// countdown are worked out on the client (see SeriesSummaryLines).
import type { FeaturedRoundResult, Session } from "@/domain/types";
import { roundShortName } from "@/lib/seo/json-ld";
import { formatRoundDates } from "@/lib/time-format";
import { trackTimeText } from "@/lib/track-time";

export type SummarySession = Pick<Session, "id" | "name" | "startsAt" | "endsAt">;

/** Track Time text for a Session start, shown until the client knows the viewer's zone. */
export interface SummaryTrackTime {
  /** "Sun" */
  weekday: string;
  /** "13:00" */
  clock: string;
  /** "GMT+8" */
  offset: string;
}

export type SeriesSummary =
  | {
      kind: "round";
      /** "Singapore Grand Prix", "Round 13 · Baku". */
      roundName: string;
      /** "2–4 Oct 2026", in Track Time. */
      dates: string;
      circuitTimeZone: string;
      /** False while the Round's Session times are TBC (then `sessions` is empty). */
      timesConfirmed: boolean;
      /** Sessions not cancelled and not yet over when the data was rendered, ordered by start. */
      sessions: SummarySession[];
      trackTimes: Record<string, SummaryTrackTime>;
      /** When the data was rendered: the server HTML (and hydration) show the next Session as of then. */
      renderedAt: string;
    }
  | { kind: "season-complete"; season: number }
  | { kind: "unavailable" };

/** A Series page's Featured Round (or "unavailable"), reduced to what a home page row shows. */
export function toSeriesSummary(featured: FeaturedRoundResult | { kind: "unavailable" }, renderedAt: string): SeriesSummary {
  if (featured.kind !== "round") return featured.kind === "season-complete" ? { kind: "season-complete", season: featured.season } : { kind: "unavailable" };
  const { round, circuit } = featured;
  const at = Date.parse(renderedAt);
  const remaining = round.sessionTimesConfirmed
    ? featured.sessions
        .filter((s) => s.status !== "cancelled" && Date.parse(s.endsAt) > at)
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    : [];
  const trackTimes: Record<string, SummaryTrackTime> = {};
  for (const s of remaining) {
    const { weekday, clock, offset } = trackTimeText(s, circuit.timeZone);
    trackTimes[s.id] = { weekday, clock, offset };
  }
  return {
    kind: "round",
    roundName: roundShortName(round, circuit),
    dates: formatRoundDates(round.startDate, round.endDate),
    circuitTimeZone: circuit.timeZone,
    timesConfirmed: round.sessionTimesConfirmed,
    sessions: remaining.map(({ id, name, startsAt, endsAt }) => ({ id, name, startsAt, endsAt })),
    trackTimes,
    renderedAt,
  };
}

export type NextSession =
  | { kind: "live"; session: SummarySession }
  | { kind: "upcoming"; session: SummarySession }
  | { kind: "finished" };

/** The running Session (earliest-starting if several overlap), else the next to start, at `now`. */
export function nextSession(sessions: SummarySession[], now: number): NextSession {
  const live = sessions.find((s) => Date.parse(s.startsAt) <= now && now < Date.parse(s.endsAt));
  if (live) return { kind: "live", session: live };
  const next = sessions.find((s) => Date.parse(s.startsAt) > now);
  return next ? { kind: "upcoming", session: next } : { kind: "finished" };
}

/** Short time to go for a list row: "in 3d 4h", "in 5h 07m", "in 12m", "now". */
export function formatStartsIn(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "now";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${String(mins).padStart(2, "0")}m`;
  return `in ${mins}m`;
}
