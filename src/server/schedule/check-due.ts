// Decides whether a Series' sources should be checked now. Pure; the cron runs every 5 minutes.
import { featuredUntil, roundOpensAt } from "./select";
import { HOUR, MINUTE } from "./time";
import type { RoundWithContext } from "./types";

export const DAILY_CHECK_MS = 24 * HOUR;
export const IN_ROUND_CHECK_MS = 2 * HOUR;
export const PRE_SESSION_WINDOW_MS = 30 * MINUTE;

export type CheckDecision =
  | { due: true; reason: "never-checked" | "daily" | "round-in-progress" | "pre-session"; sessionId?: string }
  | { due: false };

/**
 * A check is due:
 * - at least once every 24 h;
 * - every 2 h while a Round is in progress (00:00 Track Time on its first day until 2 h after its final Session);
 * - once in the 30 minutes before each Session starts, unless already checked within that window.
 */
export function decideCheckDue(input: {
  now: Date;
  lastCheckedAt: Date | null;
  rounds: RoundWithContext[];
}): CheckDecision {
  const { now, lastCheckedAt, rounds } = input;
  if (!lastCheckedAt) return { due: true, reason: "never-checked" };
  const t = now.getTime();
  const last = lastCheckedAt.getTime();
  if (t - last >= DAILY_CHECK_MS) return { due: true, reason: "daily" };

  const inProgress = rounds.some((r) => roundOpensAt(r).getTime() <= t && t < featuredUntil(r).getTime());
  if (inProgress && t - last >= IN_ROUND_CHECK_MS) return { due: true, reason: "round-in-progress" };

  for (const r of rounds) {
    for (const s of r.sessions) {
      if (s.status === "cancelled") continue;
      const start = new Date(s.startsAt).getTime();
      const windowOpens = start - PRE_SESSION_WINDOW_MS;
      if (windowOpens <= t && t < start && last < windowOpens) {
        return { due: true, reason: "pre-session", sessionId: s.id };
      }
    }
  }
  return { due: false };
}
