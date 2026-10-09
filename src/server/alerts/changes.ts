// Schedule Change push planning. Pure: the cron passes in what it read from the database.
import { SERIES } from "@/domain/series";
import type { SeriesId } from "@/domain/types";
import { dayKey, formatClock, formatDayClock } from "./format";
import { isFollowing } from "./selection";
import { sessionTag, type AlertSession, type AlertSubscription, type OutgoingPush, type PushPayload } from "./types";

/** A cancellation is still worth pushing up to this long after the Session was due to start. */
export const CANCELLED_PUSH_GRACE_MINUTES = 120;

const MINUTE = 60_000;

/** An unnotified row of schedule_changes. */
export interface ScheduleChangeRow {
  id: number;
  sessionId: string;
  series: SeriesId;
  kind: "time" | "cancelled";
  previousStartsAt: Date;
  newStartsAt: Date | null;
}

/** One Session's unnotified Schedule Changes merged into a single notice. */
export interface ChangeNotice {
  changeIds: number[];
  sessionId: string;
  kind: "time" | "cancelled" | "unchanged";
  /** Start time before the first unnotified change. */
  previousStartsAt: Date;
  /** Start time after the last change (null when cancelled). */
  newStartsAt: Date | null;
}

/**
 * Merges several unnotified changes to the same Session so a subscriber gets one push
 * describing where it ended up: moved twice → one "moved" push; moved back → nothing.
 */
export function coalesceChanges(rows: readonly ScheduleChangeRow[]): ChangeNotice[] {
  const bySession = new Map<string, ScheduleChangeRow[]>();
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    const list = bySession.get(row.sessionId) ?? [];
    list.push(row);
    bySession.set(row.sessionId, list);
  }
  return [...bySession.values()].map((list) => {
    const first = list[0];
    const last = list[list.length - 1];
    const previousStartsAt = first.previousStartsAt;
    if (last.kind === "cancelled" || !last.newStartsAt) {
      return { changeIds: list.map((r) => r.id), sessionId: first.sessionId, kind: "cancelled", previousStartsAt, newStartsAt: null };
    }
    const unchanged = last.newStartsAt.getTime() === previousStartsAt.getTime();
    return {
      changeIds: list.map((r) => r.id),
      sessionId: first.sessionId,
      kind: unchanged ? "unchanged" : "time",
      previousStartsAt,
      newStartsAt: last.newStartsAt,
    };
  });
}

export function changePayload(notice: ChangeNotice, session: AlertSession, timeZone: string): PushPayload {
  const label = `${SERIES[session.series].shortName} ${session.name}`;
  const base = { url: `/${session.series}`, tag: sessionTag(session.id) };
  if (notice.kind === "cancelled" || !notice.newStartsAt) {
    return {
      ...base,
      title: `${label} cancelled`,
      body: `${session.roundName} · was due ${formatDayClock(notice.previousStartsAt, timeZone)}`,
    };
  }
  const sameDay = dayKey(notice.newStartsAt, timeZone) === dayKey(notice.previousStartsAt, timeZone);
  const was = sameDay ? formatClock(notice.previousStartsAt, timeZone) : formatDayClock(notice.previousStartsAt, timeZone);
  return {
    ...base,
    title: `${label} moved`,
    body: `${session.roundName} · now starts ${formatDayClock(notice.newStartsAt, timeZone)} (was ${was})`,
  };
}

/** Whether a notice is still worth pushing at `now` (no pushes about Sessions already under way). */
export function isNoticeRelevant(notice: ChangeNotice, now: Date): boolean {
  if (notice.kind === "unchanged") return false;
  if (notice.kind === "cancelled") {
    return notice.previousStartsAt.getTime() > now.getTime() - CANCELLED_PUSH_GRACE_MINUTES * MINUTE;
  }
  return (notice.newStartsAt?.getTime() ?? 0) > now.getTime();
}

export interface ChangePlan {
  /** Every change id to mark notified — including those that produced no push. */
  changeIds: number[];
  pushes: OutgoingPush[];
}

/** Who gets which Schedule Change push: subscriptions following the Session's Series and Session Type. */
export function planChangePushes(
  rows: readonly ScheduleChangeRow[],
  sessionsById: ReadonlyMap<string, AlertSession>,
  subscriptions: readonly AlertSubscription[],
  now: Date,
): ChangePlan {
  const changeIds = rows.map((r) => r.id);
  const pushes: OutgoingPush[] = [];
  for (const notice of coalesceChanges(rows)) {
    const session = sessionsById.get(notice.sessionId);
    if (!session || !isNoticeRelevant(notice, now)) continue;
    const until = notice.newStartsAt ?? new Date(notice.previousStartsAt.getTime() + CANCELLED_PUSH_GRACE_MINUTES * MINUTE);
    const ttlSeconds = Math.max(60, Math.floor((until.getTime() - now.getTime()) / 1000));
    for (const subscription of subscriptions) {
      if (!isFollowing(subscription.follows, session.series, session.type)) continue;
      pushes.push({ subscription, payload: changePayload(notice, session, subscription.timeZone), ttlSeconds });
    }
  }
  return { changeIds, pushes };
}
