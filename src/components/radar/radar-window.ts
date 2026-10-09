import type { Session } from "@/domain/types";
import { RADAR_LEAD_MINUTES } from "@/domain/series";

const LEAD_MS = RADAR_LEAD_MINUTES * 60 * 1000;

/**
 * The Session that keeps the rain radar open at `now`: a non-cancelled Session with
 * now ∈ [startsAt − RADAR_LEAD_MINUTES, endsAt]. Null when the radar should be hidden.
 */
export function radarWindowSession(sessions: readonly Session[], now: number): Session | null {
  for (const session of sessions) {
    if (session.status === "cancelled") continue;
    const start = Date.parse(session.startsAt);
    const end = Date.parse(session.endsAt);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    if (now >= start - LEAD_MS && now <= end) return session;
  }
  return null;
}
