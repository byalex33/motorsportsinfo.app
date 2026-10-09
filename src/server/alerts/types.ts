import type { SeriesId, SessionStatus, SessionType } from "@/domain/types";
import type { DocumentAlerts } from "@/db/schema";
import type { Follows } from "./selection";

/** A saved push subscription, as the cron sees it. */
export interface AlertSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  leadMinutes: number;
  follows: Follows;
  documentAlerts: DocumentAlerts;
  timeZone: string;
  failureCount: number;
}

/** A Session as read from the database for alerts, with its Round's name. */
export interface AlertSession {
  id: string;
  series: SeriesId;
  type: SessionType;
  name: string;
  startsAt: Date;
  status: SessionStatus;
  roundName: string;
  /** False when the Round's Session times are not confirmed ("Times TBC"). */
  timesConfirmed: boolean;
}

/** What the service worker (public/sw-push.js) receives. */
export interface PushPayload {
  title: string;
  body: string;
  /** Path to open on click, e.g. "/f1". */
  url: string;
  /** Notification tag; one per Session so a later push replaces an earlier one. */
  tag: string;
}

export interface OutgoingPush {
  subscription: AlertSubscription;
  payload: PushPayload;
  /** Seconds the push service may hold the message before dropping it. */
  ttlSeconds: number;
}

export function sessionTag(sessionId: string): string {
  return `session:${sessionId}`;
}
