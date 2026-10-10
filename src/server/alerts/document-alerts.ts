// Document Alerts: a push when the FIA publishes a new FIA Document for a Series the device chose.
// Pure: the alerts cron passes in what it read from the database. No server-only imports, so the
// Alerts page shares the selection helpers.
import { SERIES } from "@/domain/series";
import { FIA_DOCUMENT_SERIES, type DocumentAlertLevel, type FiaDocumentKind, type FiaDocumentSeries } from "@/domain/types";
import type { DocumentAlerts } from "@/db/schema";
import { fiaDocumentPagePath } from "@/lib/fia-document-path";
import type { AlertSubscription, OutgoingPush, PushPayload } from "./types";

export type { DocumentAlerts };

export const DOCUMENT_ALERT_LEVELS: readonly DocumentAlertLevel[] = ["stewards", "all"];

/** More new documents than this for one Series in one run arrive as a single summary push. */
export const DOCUMENT_SUMMARY_THRESHOLD = 2;
/** A document alert is stale after this long: the push service drops it rather than deliver it late. */
const DOCUMENT_PUSH_TTL_SECONDS = 3 * 60 * 60;

/** An unnotified row of fia_documents. */
export interface DocumentAlertRow {
  url: string;
  series: FiaDocumentSeries;
  event: string;
  number: number | null;
  title: string;
  kind: FiaDocumentKind;
  file: string | null;
  publishedAt: Date | null;
}

/** Keeps only FIA Series with a known level, in Series order. */
export function normalizeDocumentAlerts(input: unknown): DocumentAlerts {
  const out: DocumentAlerts = {};
  if (!input || typeof input !== "object") return out;
  for (const series of FIA_DOCUMENT_SERIES) {
    const level: unknown = (input as Record<string, unknown>)[series];
    if ((DOCUMENT_ALERT_LEVELS as readonly unknown[]).includes(level)) out[series] = level as DocumentAlertLevel;
  }
  return out;
}

export function setDocumentAlert(alerts: DocumentAlerts, series: FiaDocumentSeries, level: DocumentAlertLevel | null): DocumentAlerts {
  return normalizeDocumentAlerts({ ...alerts, [series]: level ?? undefined });
}

export function hasDocumentAlerts(alerts: DocumentAlerts): boolean {
  return FIA_DOCUMENT_SERIES.some((series) => alerts[series]);
}

/** Whether a device with these choices wants an alert for a document of this kind. */
export function wantsDocument(alerts: DocumentAlerts, series: FiaDocumentSeries, kind: FiaDocumentKind): boolean {
  const level = alerts[series];
  return level === "all" || (level === "stewards" && kind === "stewards");
}

function documentUrl(doc: DocumentAlertRow): string {
  return doc.file ? fiaDocumentPagePath(doc.series, doc.file) : `/${doc.series}#documents`;
}

/** One document: its title, then where it is from ("FIA Doc 29 · F1 Singapore Grand Prix"). */
export function documentPayload(doc: DocumentAlertRow): PushPayload {
  const label = doc.number !== null ? `FIA Doc ${doc.number}` : "FIA document";
  return {
    title: doc.title,
    body: `${label} · ${SERIES[doc.series].shortName} ${doc.event}`,
    url: documentUrl(doc),
    tag: `fia-document:${doc.url}`,
  };
}

/** Several documents for one Series at once: one push listing the first titles, opening the Series page. */
export function documentSummaryPayload(series: FiaDocumentSeries, docs: readonly DocumentAlertRow[]): PushPayload {
  const shown = docs.slice(0, 2).map((d) => d.title);
  const more = docs.length - shown.length;
  return {
    title: `${docs.length} new FIA documents · ${SERIES[series].shortName} ${docs[0].event}`,
    body: more > 0 ? `${shown.join(" · ")} and ${more} more` : shown.join(" · "),
    url: `/${series}#documents`,
    tag: `fia-documents:${series}`,
  };
}

/**
 * The pushes for a batch of new documents: per device and Series, each wanted document on its own,
 * or one summary when there are more than DOCUMENT_SUMMARY_THRESHOLD. Newest first within a Series.
 */
export function planDocumentPushes(docs: readonly DocumentAlertRow[], subs: readonly AlertSubscription[]): OutgoingPush[] {
  const pushes: OutgoingPush[] = [];
  const bySeries = new Map<FiaDocumentSeries, DocumentAlertRow[]>();
  for (const doc of docs) bySeries.set(doc.series, [...(bySeries.get(doc.series) ?? []), doc]);
  for (const list of bySeries.values()) {
    list.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0) || (b.number ?? 0) - (a.number ?? 0));
  }

  for (const subscription of subs) {
    for (const [series, list] of bySeries) {
      const wanted = list.filter((d) => wantsDocument(subscription.documentAlerts, series, d.kind));
      if (wanted.length === 0) continue;
      const payloads =
        wanted.length > DOCUMENT_SUMMARY_THRESHOLD ? [documentSummaryPayload(series, wanted)] : wanted.map(documentPayload);
      for (const payload of payloads) pushes.push({ subscription, payload, ttlSeconds: DOCUMENT_PUSH_TTL_SECONDS });
    }
  }
  return pushes;
}
