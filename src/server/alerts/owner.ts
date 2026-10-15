// The owner's daily sync alert: one push to the site owner's own device when the schedule sync is unhealthy,
// so a broken source shows up without anyone polling /api/status. Off unless OWNER_PUSH_ENDPOINT is set.
// Pure: the cron reads the status and the owner's subscription.
import { SERIES } from "@/domain/series";
import { MAX_SINCE_SUCCESS_MS, type SyncStatus } from "@/server/status";
import type { PushPayload } from "./types";

/** The alert goes with the cron run at this hour, UTC, on the hour. */
export const OWNER_ALERT_HOUR_UTC = 7;
/** Long enough to reach a phone that is off overnight, short enough not to arrive after the next one. */
export const OWNER_ALERT_TTL_SECONDS = 12 * 60 * 60;
const FLAG_MESSAGE_MAX = 160;

/** The endpoint of the owner's push subscription (copied from the push_subscriptions row), or null when unset. */
export function getOwnerPushEndpoint(): string | null {
  return process.env.OWNER_PUSH_ENDPOINT?.trim() || null;
}

/** Once a day: only the every-minute cron's 07:00 UTC run sends it. */
export function isOwnerAlertDue(now: Date): boolean {
  return now.getUTCHours() === OWNER_ALERT_HOUR_UTC && now.getUTCMinutes() === 0;
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
