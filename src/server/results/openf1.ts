// F1 Session Results from OpenF1 (https://openf1.org), the F1 schedule's own source. CC BY-NC-SA 4.0.
import type { SessionResult, SessionResultEntry } from "@/domain/types";
import { formatLapTime } from "@/lib/lap-time";
import { classifiedPosition } from "@/server/openf1/position";

/** Qualifying sessions give `duration` and `gap_to_leader` per segment: [Q1, Q2, Q3]. */
type PerSegment<T> = T | (T | null)[];

export interface OpenF1SessionResult {
  session_key: number;
  /** null, or a status such as "RT", for a driver who was not classified. */
  position: number | string | null;
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

/** The full classification of one OpenF1 Session, or null when OpenF1 has none for it yet. */
export function parseOpenF1Result(sessionKey: number, results: OpenF1SessionResult[], drivers: OpenF1Driver[]): SessionResult | null {
  const rows = results
    .filter((r) => r.session_key === sessionKey)
    .map((r) => ({ ...r, position: classifiedPosition(r.position) }))
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

function entryTime(r: OpenF1SessionResult & { position: number | null }): string | null {
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
