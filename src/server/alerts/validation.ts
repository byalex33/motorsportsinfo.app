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

export const browserSubscriptionSchema = z.object({
  endpoint: httpsUrl,
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

export const unsubscribeSchema = z.object({ endpoint: httpsUrl });

/** Sent by the service worker when the browser replaces a subscription (pushsubscriptionchange). */
export const rotateSchema = z.object({ oldEndpoint: httpsUrl, subscription: browserSubscriptionSchema });
