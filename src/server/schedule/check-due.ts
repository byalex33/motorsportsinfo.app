// Decides whether a Series' sources should be checked now. Pure; the cron runs every 5 minutes.
import { featuredUntil, roundOpensAt } from "./select";
import { HOUR, MINUTE } from "./time";
import type { RoundWithContext } from "./types";

export const DAILY_CHECK_MS = 24 * HOUR;
export const IN_ROUND_CHECK_MS = 2 * HOUR;
export const PRE_SESSION_WINDOW_MS = 30 * MINUTE;
/** A change seen once is confirmed (or dropped) by a check this soon after, not hours later. */
export const CONFIRM_CHANGE_MS = 10 * MINUTE;
/** Waits before retrying a failed check: 10 min, then 30 min, then hourly until one succeeds. */
export const RETRY_BACKOFF_MS = [10 * MINUTE, 30 * MINUTE, 60 * MINUTE] as const;

type ScheduledReason = "daily" | "confirm-change" | "round-in-progress" | "pre-session";

export type CheckDecision =
  | { due: true; reason: "never-checked" | ScheduledReason | "retry-after-failure"; sessionId?: string }
  | { due: false };

interface ScheduledCheck {
  reason: ScheduledReason;
  /** When this rule made the check due (ms). */
  since: number;
  sessionId?: string;
}

/** Every rule that makes a check due at t, measured from the last successful check, in priority order. */
function scheduledChecks(t: number, last: number, rounds: RoundWithContext[], hasPendingChanges: boolean): ScheduledCheck[] {
  const due: ScheduledCheck[] = [];
  if (t - last >= DAILY_CHECK_MS) due.push({ reason: "daily", since: last + DAILY_CHECK_MS });
  if (hasPendingChanges && t - last >= CONFIRM_CHANGE_MS) due.push({ reason: "confirm-change", since: last + CONFIRM_CHANGE_MS });

  for (const r of rounds) {
    const opens = roundOpensAt(r).getTime();
    if (opens <= t && t < featuredUntil(r).getTime() && t - last >= IN_ROUND_CHECK_MS) {
      due.push({ reason: "round-in-progress", since: Math.max(opens, last + IN_ROUND_CHECK_MS) });
    }
  }

  for (const r of rounds) {
    for (const s of r.sessions) {
      if (s.status === "cancelled") continue;
      const start = new Date(s.startsAt).getTime();
      const windowOpens = start - PRE_SESSION_WINDOW_MS;
      if (windowOpens <= t && t < start && last < windowOpens) {
        due.push({ reason: "pre-session", since: windowOpens, sessionId: s.id });
      }
    }
  }
  return due;
}

/** The wait after a failed check that was made `failingFor` ms after the check became due. */
function retryBackoff(failingFor: number): number {
  const [first, second, rest] = RETRY_BACKOFF_MS;
  if (failingFor < first) return first;
  if (failingFor < first + second) return second;
  return rest;
}

/**
 * A check is due:
 * - at least once every 24 h;
 * - every 2 h while a Round is in progress (00:00 Track Time on its first day until 2 h after its final Session);
 * - once in the 30 minutes before each Session starts, unless already checked within that window;
 * - 10 minutes after a check that saw an unconfirmed change, so a moved Session is published before
 *   its old start time rather than at the next 2-hourly check.
 * These are measured from the last successful check, so a failed check never pushes them later.
 * While a due check keeps failing it is retried 10 min, then 30 min, then every 60 min after each
 * attempt; a newer rule becoming due (a pre-session window opening mid-outage) gets a fresh attempt.
 * lastCheckedAt is written when a check starts, so one still running holds off the next for 10 min.
 */
export function decideCheckDue(input: {
  now: Date;
  lastCheckedAt: Date | null;
  lastSucceededAt: Date | null;
  rounds: RoundWithContext[];
  /** True when a source change is waiting for a second check to agree. */
  hasPendingChanges?: boolean;
}): CheckDecision {
  const { now, lastCheckedAt, lastSucceededAt, rounds, hasPendingChanges = false } = input;
  if (!lastCheckedAt) return { due: true, reason: "never-checked" };
  const t = now.getTime();
  const lastChecked = lastCheckedAt.getTime();
  const lastSucceeded = lastSucceededAt?.getTime() ?? Number.NEGATIVE_INFINITY;

  const scheduled = scheduledChecks(t, lastSucceeded, rounds, hasPendingChanges);
  if (scheduled.length === 0) return { due: false };
  if (lastChecked <= lastSucceeded) return toDecision(scheduled[0]);

  // The last check failed. If it was made before the newest due rule, that rule hasn't been tried yet.
  const newest = scheduled.reduce((a, b) => (b.since > a.since ? b : a));
  if (lastChecked < newest.since) return toDecision(newest);
  if (t - lastChecked < retryBackoff(lastChecked - newest.since)) return { due: false };
  return { due: true, reason: "retry-after-failure" };
}

function toDecision({ reason, sessionId }: ScheduledCheck): CheckDecision {
  return sessionId ? { due: true, reason, sessionId } : { due: true, reason };
}
