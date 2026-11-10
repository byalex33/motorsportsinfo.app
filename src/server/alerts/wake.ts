// What an alerts cron run has to do, decided from the remote cache instead of the database, so the minutes
// with nothing due (most of them) never wake the database and Neon can scale to zero between them.
import { isNull } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { fiaDocuments, scheduleChanges } from "@/db/schema";
import { REMINDER_LEAD_MINUTES } from "@/domain/series";
import { SERIES_IDS } from "@/domain/types";
import { scheduleTag } from "@/server/schedule";
import { loadPublishedSchedule } from "@/server/schedule/db-read";
import { errorMessage } from "@/server/schedule/sources/http";
import type { RoundWithSessions } from "@/server/schedule/types";
import { isOwnerAlertDue } from "./owner";
import { isReminderDue } from "./reminders";

/**
 * Cache tag for whether Schedule Changes or FIA Documents wait to be pushed. The sync revalidates it when it
 * records some, and the alerts cron after every run that pushed them.
 */
export const UNSENT_PUSHES_TAG = "alerts:unsent";

export interface AlertsWork {
  /** A Session Reminder may be due for some subscriber. */
  reminders: boolean;
  /** Schedule Changes or FIA Documents wait to be pushed. */
  pushes: boolean;
  /** A run in the 07:00 UTC hour before this instance has done today's daily pass (owner's sync alert and housekeeping). */
  daily: boolean;
}

/** Start times (epoch ms) of the Sessions a Session Reminder can be for: scheduled, with confirmed times. */
export function reminderSessionStarts(schedules: readonly RoundWithSessions[], after: number): number[] {
  const starts: number[] = [];
  for (const { round, sessions } of schedules) {
    if (!round.sessionTimesConfirmed) continue;
    for (const s of sessions) {
      const start = Date.parse(s.startsAt);
      if (s.status === "scheduled" && start > after) starts.push(start);
    }
  }
  return starts;
}

/** Whether any subscriber's Session Reminder can be due now, whichever lead time they chose. */
export function remindersMayBeDue(starts: readonly number[], now: Date): boolean {
  return starts.some((start) => REMINDER_LEAD_MINUTES.some((lead) => isReminderDue(new Date(start), lead, now)));
}

// Revalidated with every Series' published schedule, so a moved Session is reminded at its new time.
// Null when a schedule can't be read (cached only briefly, like the failed read).
async function cachedReminderSessionStarts(): Promise<number[] | null> {
  "use cache: remote";
  cacheLife("days");
  cacheTag(...SERIES_IDS.map((id) => scheduleTag(id)));

  const schedules = await Promise.all(SERIES_IDS.map((id) => loadPublishedSchedule(id)));
  if (schedules.some((s) => s === null)) return null;
  return reminderSessionStarts(schedules.flatMap((s) => s ?? []), Date.now());
}

async function hasUnsentPushes(): Promise<boolean> {
  "use cache: remote";
  cacheLife("days");
  cacheTag(UNSENT_PUSHES_TAG);

  const db = getDb();
  if (!db) return false;
  const [changes, documents] = await Promise.all([
    db.select({ id: scheduleChanges.id }).from(scheduleChanges).where(isNull(scheduleChanges.notifiedAt)).limit(1),
    db.select({ url: fiaDocuments.url }).from(fiaDocuments).where(isNull(fiaDocuments.notifiedAt)).limit(1),
  ]);
  return changes.length > 0 || documents.length > 0;
}

/** What this run has to do. If the cache can't say, everything: the database decides, as before. */
export async function planAlertsRun(now: Date): Promise<AlertsWork> {
  const daily = isOwnerAlertDue(now);
  try {
    const [starts, pushes] = await Promise.all([cachedReminderSessionStarts(), hasUnsentPushes()]);
    return { reminders: !starts || remindersMayBeDue(starts, now), pushes, daily };
  } catch (error) {
    console.warn(`[alerts] could not plan the run from the cache; running everything: ${errorMessage(error)}`);
    return { reminders: true, pushes: true, daily };
  }
}
