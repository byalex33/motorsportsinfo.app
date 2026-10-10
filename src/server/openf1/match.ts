import type { Session } from "@/domain/types";
import { openF1SessionType, type OpenF1Session } from "@/server/schedule/sources/openf1";

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
