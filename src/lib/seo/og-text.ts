// What a Series' Open Graph image says. Pure, so it can be tested; the image route only lays it out.
// The image can't know the viewer's zone, so the next Session is given in UTC.
import { SERIES } from "@/domain/series";
import type { FeaturedRoundResult, SeriesId } from "@/domain/types";
import { getRoundStatus } from "@/lib/round-status";
import { formatRoundDates } from "@/lib/time-format";
import { roundShortName } from "./json-ld";

export interface OgText {
  /** "F1 · 2026" */
  eyebrow: string;
  /** "Singapore Grand Prix", "Season complete", "Schedule coming soon" */
  title: string;
  /** "Marina Bay Street Circuit · 9–11 Oct 2026" */
  meta: string | null;
  /** "Next: Qualifying · Sat 10 Oct, 13:30 UTC", "Live: Race", "Session times TBC" */
  status: string | null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sat 10 Oct, 13:30 UTC" — locale-free so the image is the same wherever it renders. */
export function formatUtc(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hh}:${mm} UTC`;
}

/**
 * `featured` is the Series page's Featured Round (or "unavailable" when no schedule could be read);
 * `now` is when the page data was rendered, so the image agrees with the page it previews.
 */
export function seriesOgText(series: SeriesId, featured: FeaturedRoundResult | { kind: "unavailable" }, now: number): OgText {
  const info = SERIES[series];
  if (featured.kind === "unavailable") {
    return { eyebrow: `${info.shortName} · ${info.name}`, title: "Schedule coming soon", meta: null, status: null };
  }
  if (featured.kind === "season-complete") {
    return {
      eyebrow: `${info.shortName} · ${featured.season}`,
      title: "Season complete",
      meta: `The ${featured.season} ${info.name} season is over`,
      status: `${featured.season + 1} schedule coming soon`,
    };
  }

  const { round, circuit, sessions } = featured;
  const meta = `${circuit.name} · ${formatRoundDates(round.startDate, round.endDate)}`;
  const eyebrow = `${info.shortName} · ${round.season}`;
  const title = roundShortName(round, circuit);

  if (!round.sessionTimesConfirmed) return { eyebrow, title, meta, status: "Session times TBC" };
  if (sessions.length === 0) return { eyebrow, title, meta, status: null };

  const st = getRoundStatus(sessions, now);
  if (st.kind === "live") return { eyebrow, title, meta, status: `Live: ${st.session.name}` };
  if (st.kind === "upcoming") return { eyebrow, title, meta, status: `Next: ${st.session.name} · ${formatUtc(st.session.startsAt)}` };
  return { eyebrow, title, meta, status: "Round complete" };
}
