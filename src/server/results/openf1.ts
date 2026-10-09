// F1 Session Results from OpenF1 (https://openf1.org), the F1 schedule's own source. CC BY-NC-SA 4.0.
import type { Session, SessionResult, SessionResultEntry } from "@/domain/types";
import { openF1SessionType, type OpenF1Session } from "@/server/schedule/sources/openf1";

/** Qualifying sessions give `duration` and `gap_to_leader` per segment: [Q1, Q2, Q3]. */
type PerSegment<T> = T | (T | null)[];

export interface OpenF1SessionResult {
  session_key: number;
  /** null for a driver who was not classified. */
  position: number | null;
  driver_number: number;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
  /** Seconds: race time, or best lap in practice; per segment in qualifying. */
  duration: PerSegment<number> | null;
  /** Seconds behind the leader, or text for lapped cars ("+1 LAP"); per segment in qualifying. */
  gap_to_leader: PerSegment<number | string> | null;
}

export interface OpenF1Driver {
  session_key: number;
  driver_number: number;
  name_acronym: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  team_name: string | null;
}

/**
 * Our Session starts may differ from OpenF1's after a Schedule Override or a fallback-source sync, so the
 * match is the OpenF1 Session of the same Session Type nearest in time, within this window. F1 Sessions of
 * one type are at least 3.5 hours apart (FP1 → FP2), so the nearest is never a neighbour.
 */
const MATCH_WINDOW_MS = 3 * 60 * 60 * 1000;

export function matchOpenF1Session(session: Pick<Session, "type" | "startsAt">, candidates: OpenF1Session[]): OpenF1Session | null {
  const start = Date.parse(session.startsAt);
  let best: OpenF1Session | null = null;
  let bestGap = MATCH_WINDOW_MS;
  for (const candidate of candidates) {
    if (openF1SessionType(candidate.session_name) !== session.type) continue;
    const gap = Math.abs(Date.parse(candidate.date_start) - start);
    if (gap <= bestGap) {
      best = candidate;
      bestGap = gap;
    }
  }
  return best;
}

/** The full classification of one OpenF1 Session, or null when OpenF1 has none for it yet. */
export function parseOpenF1Result(sessionKey: number, results: OpenF1SessionResult[], drivers: OpenF1Driver[]): SessionResult | null {
  const rows = results
    .filter((r) => r.session_key === sessionKey)
    // Classified drivers in order; the unclassified after them, in OpenF1's order.
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
  if (!rows.some((r) => r.position !== null)) return null;

  return {
    entries: rows.map((r): SessionResultEntry => {
      // Driver lists are per Session; a reserve driver may appear in only one of them.
      const driver =
        drivers.find((d) => d.session_key === sessionKey && d.driver_number === r.driver_number) ??
        drivers.find((d) => d.driver_number === r.driver_number);
      return {
        position: r.position,
        name: driver ? driverName(driver) : `Car ${r.driver_number}`,
        team: driver?.team_name ?? null,
        time: entryTime(r),
      };
    }),
  };
}

function entryTime(r: OpenF1SessionResult): string | null {
  if (r.dsq) return "DSQ";
  // Qualifying: each driver's best lap in the last segment they reached. A retirement there still sets a grid slot.
  if (Array.isArray(r.duration)) {
    const best = r.duration.findLast((t) => t !== null);
    return best != null ? formatLapTime(best) : r.dns ? "DNS" : r.dnf ? "DNF" : null;
  }
  if (r.dns) return "DNS";
  if (r.dnf) return "DNF";
  if (r.position === 1) return r.duration != null ? formatLapTime(r.duration) : null;
  return formatGap(Array.isArray(r.gap_to_leader) ? null : r.gap_to_leader);
}

/** 92.274 → "1:32.274"; 6434.808 → "1:47:14.808". */
export function formatLapTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = ((ms % 60_000) / 1000).toFixed(3).padStart(6, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function formatGap(gap: number | string | null): string | null {
  if (gap === null) return null;
  if (typeof gap === "number") return `+${gap.toFixed(3)}`;
  const text = gap.trim().toUpperCase();
  return text.startsWith("+") ? text : `+${text}`;
}

// OpenF1's full_name upper-cases the surname ("Max VERSTAPPEN").
function driverName(driver: OpenF1Driver): string {
  const parts = [driver.first_name, driver.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : driver.full_name;
}
