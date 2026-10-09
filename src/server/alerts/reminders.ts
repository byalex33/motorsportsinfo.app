// Session Reminder selection. Pure: the cron passes in what it read from the database.
import { SERIES } from "@/domain/series";
import { formatStart, formatTimeUntil } from "./format";
import { isFollowing } from "./selection";
import { sessionTag, type AlertSession, type AlertSubscription, type OutgoingPush } from "./types";

/** A reminder that is late by up to this long is still sent (covers missed cron runs). */
export const REMINDER_CATCH_UP_MINUTES = 10;

const MINUTE = 60_000;

export interface DueReminder extends OutgoingPush {
  sessionId: string;
  startsAt: Date;
}

/** Idempotency key matching the reminders_sent primary key. */
export function reminderKey(subscriptionId: string, sessionId: string, startsAt: Date): string {
  return `${subscriptionId}|${sessionId}|${startsAt.toISOString()}`;
}

/**
 * Whether a reminder is due now: its reminder time (start − lead) has passed, by no more than
 * the catch-up window, and the Session has not started yet.
 */
export function isReminderDue(startsAt: Date, leadMinutes: number, now: Date): boolean {
  const remindAt = startsAt.getTime() - leadMinutes * MINUTE;
  const t = now.getTime();
  return remindAt <= t && remindAt > t - REMINDER_CATCH_UP_MINUTES * MINUTE && startsAt.getTime() > t;
}

export function reminderPayload(session: AlertSession, timeZone: string, now: Date) {
  const minutesLeft = (session.startsAt.getTime() - now.getTime()) / MINUTE;
  return {
    title: `${SERIES[session.series].shortName} ${session.name} in ${formatTimeUntil(minutesLeft)}`,
    body: `${session.roundName} · starts ${formatStart(session.startsAt, now, timeZone)}`,
    url: `/${session.series}`,
    tag: sessionTag(session.id),
  };
}

/** Every (subscription, Session) pair whose Session Reminder is due now. Dedupe happens in the database. */
export function selectDueReminders(
  subscriptions: readonly AlertSubscription[],
  sessions: readonly AlertSession[],
  now: Date,
): DueReminder[] {
  const eligible = sessions.filter((s) => s.status === "scheduled" && s.timesConfirmed);
  const due: DueReminder[] = [];
  for (const subscription of subscriptions) {
    for (const session of eligible) {
      if (!isFollowing(subscription.follows, session.series, session.type)) continue;
      if (!isReminderDue(session.startsAt, subscription.leadMinutes, now)) continue;
      due.push({
        subscription,
        sessionId: session.id,
        startsAt: session.startsAt,
        payload: reminderPayload(session, subscription.timeZone, now),
        ttlSeconds: Math.max(60, Math.floor((session.startsAt.getTime() - now.getTime()) / 1000)),
      });
    }
  }
  return due;
}
