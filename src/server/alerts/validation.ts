// Input validation for the push subscription endpoints.
import { z } from "zod";
import { SERIES, REMINDER_LEAD_MINUTES } from "@/domain/series";
import {
  FIA_DOCUMENT_SERIES,
  SERIES_IDS,
  type DocumentAlertLevel,
  type FiaDocumentSeries,
  type SeriesId,
  type SessionType,
} from "@/domain/types";
import { DOCUMENT_ALERT_LEVELS, normalizeDocumentAlerts, type DocumentAlerts } from "./document-alerts";
import { normalizeFollows, type Follows } from "./selection";

/** True for IANA zone names this runtime knows, e.g. "Europe/London", "UTC". */
export function isValidTimeZone(value: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/.test(value) || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const base64url = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+=*$/, "Expected base64url");

const httpsUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "The push endpoint must be an https URL");

/**
 * The browsers' push services. The alerts cron POSTs to every stored endpoint each minute, so an
 * endpoint anywhere else would turn it into a request source for whoever registered the URL.
 */
const PUSH_SERVICE_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Samsung Internet, Opera, Brave
  /^(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com$/, // Firefox (updates.push.services.mozilla.com)
  /^web\.push\.apple\.com$/, // Safari, and Home Screen web apps on iOS
  /^(?:[a-z0-9-]+\.)+notify\.windows\.com$/, // Edge on Windows (WNS)
];

/** True for an https URL on a known browser push service, on the default port and without credentials. */
export function isPushServiceEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    PUSH_SERVICE_HOSTS.some((host) => host.test(url.hostname))
  );
}

const pushEndpoint = z.string().max(2048).refine(isPushServiceEndpoint, "Unknown push service");

export const browserSubscriptionSchema = z.object({
  endpoint: pushEndpoint,
  keys: z.object({ p256dh: base64url, auth: base64url }),
});

const followsShape = Object.fromEntries(
  SERIES_IDS.map((id) => [
    id,
    z
      .array(z.enum(SERIES[id].sessionTypes as [SessionType, ...SessionType[]]))
      .max(SERIES[id].sessionTypes.length * 2)
      .optional(),
  ]),
) as Record<SeriesId, z.ZodOptional<z.ZodArray<z.ZodEnum<Record<SessionType, SessionType>>>>>;

export const followsSchema = z.strictObject(followsShape).transform((value): Follows => normalizeFollows(value));

export const leadMinutesSchema = z.literal(REMINDER_LEAD_MINUTES);

const documentAlertLevel = z.enum(DOCUMENT_ALERT_LEVELS as [DocumentAlertLevel, ...DocumentAlertLevel[]]);

export const documentAlertsSchema = z
  .strictObject(
    Object.fromEntries(FIA_DOCUMENT_SERIES.map((id) => [id, documentAlertLevel.optional()])) as Record<
      FiaDocumentSeries,
      z.ZodOptional<typeof documentAlertLevel>
    >,
  )
  .transform((value): DocumentAlerts => normalizeDocumentAlerts(value));

export const subscribeSchema = z.object({
  subscription: browserSubscriptionSchema,
  follows: followsSchema,
  /** Optional, so a page loaded before Document Alerts existed can still save its reminders. */
  documentAlerts: documentAlertsSchema.default({}),
  leadMinutes: leadMinutesSchema,
  timeZone: z.string().refine(isValidTimeZone, "Unknown time zone"),
});
export type SubscribeInput = z.infer<typeof subscribeSchema>;

// Unsubscribing, and the old endpoint of a rotation, only look up a stored row and never send anything,
// so they stay https-only: a device saved before the push service check can still turn its alerts off.
export const unsubscribeSchema = z.object({ endpoint: httpsUrl });

/** Sent by the service worker when the browser replaces a subscription (pushsubscriptionchange). */
export const rotateSchema = z.object({ oldEndpoint: httpsUrl, subscription: browserSubscriptionSchema });
