// The owner's daily sync alert: one push to the site owner's own device when the schedule sync is unhealthy,
// so a broken source shows up without anyone polling /api/status. Off unless OWNER_PUSH_ENDPOINT is set.
// The cron reads the status and the owner's subscription; daily_runs records which UTC days had their run.
import { SERIES } from "@/domain/series";
import { MAX_SINCE_SUCCESS_MS, type SyncStatus } from "@/server/status";
import type { PushPayload } from "./types";

/** The alert (and the daily housekeeping) goes with the first cron run in this hour, UTC. */
export const OWNER_ALERT_HOUR_UTC = 7;
/** Long enough to reach a phone that is off overnight, short enough not to arrive after the next one. */
export const OWNER_ALERT_TTL_SECONDS = 12 * 60 * 60;
const FLAG_MESSAGE_MAX = 160;

/** The endpoint of the owner's push subscription (copied from the push_subscriptions row), or null when unset. */
export function getOwnerPushEndpoint(): string | null {
  return process.env.OWNER_PUSH_ENDPOINT?.trim() || null;
}

/** The UTC date a daily run is for, e.g. "2026-10-15": the daily_runs key. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Whether a run falls in the daily run's hour. Any run in the hour may do it (the first to claim the day in
 * daily_runs does), so a 07:00 run that is late, skipped or fails is made up a minute later.
 */
export function isDailyRunHour(now: Date): boolean {
  return now.getUTCHours() === OWNER_ALERT_HOUR_UTC;
}

/**
 * The last UTC day this instance knows had its daily run. Only a hint, so the alerts cron's planner does not
 * wake the database for the rest of the hour once the run is done; daily_runs decides.
 */
let lastDailyRunDay: string | null = null;

export function noteDailyRunDone(now: Date): void {
  lastDailyRunDay = utcDay(now);
}

/** Whether this run may have the daily pass to do: in its hour, and not yet done today as far as this instance knows. */
export function isOwnerAlertDue(now: Date): boolean {
  return isDailyRunHour(now) && lastDailyRunDay !== utcDay(now);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** What the push says: the Series not synced lately and the first open Schedule Flag. Null when all is well. */
export function ownerAlertPayload(status: SyncStatus): PushPayload | null {
  if (status.ok) return null;
  const failing = status.series.filter((s) => !s.ok).map((s) => s.series);
  const [flag] = status.openFlags;
  const lines: string[] = [];
  if (failing.length > 0) {
    const hours = Math.round(MAX_SINCE_SUCCESS_MS / (60 * 60 * 1000));
    lines.push(`Not synced in ${hours} h: ${failing.map((id) => SERIES[id].shortName).join(", ")}`);
  }
  if (flag) {
    const more = status.openFlags.length > 1 ? ` (+${status.openFlags.length - 1} more)` : "";
    lines.push(`Flag: ${SERIES[flag.series].shortName} · ${truncate(flag.message, FLAG_MESSAGE_MAX)}${more}`);
  }
  const first = failing[0] ?? flag?.series;
  return {
    title: "Schedule sync needs attention",
    body: lines.join("\n"),
    url: first ? `/${first}` : "/",
    tag: "owner:sync-status",
  };
}
