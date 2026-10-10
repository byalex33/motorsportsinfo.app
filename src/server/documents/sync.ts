// Watches fia.com during a Round and records each new FIA Document in fia_documents, for the alerts
// cron to push (Document Alerts). Run by the schedule sync cron every 5 minutes.
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { fiaDocuments } from "@/db/schema";
import type { Circuit, FiaDocumentSeries, Round } from "@/domain/types";
import { listCalendarSessions } from "@/server/schedule";
import { addDays } from "@/server/schedule/time";
import { defaultContext, errorMessage, type SourceContext } from "@/server/schedule/sources/http";
import { eventMatchesRound, fetchFiaDocuments, type FiaEventDocuments } from "./fia";

/** fia.com is watched from this many days before a Round's first day (the FIA posts notes early)… */
const WATCH_BEFORE_DAYS = 4;
/** …to this many days after its last (late stewards' decisions, final classifications). */
const WATCH_AFTER_DAYS = 1;
/**
 * Only documents this recent when first seen are pushed. Older ones are recorded as already notified:
 * the first look at a Round mid-weekend, or a catch-up after fia.com was down, never floods anyone.
 */
export const DOCUMENT_ALERT_FRESH_MINUTES = 60;

const MINUTE = 60_000;

export interface WatchedRound {
  round: Round;
  circuit: Circuit;
}

export type DocumentsSyncResult =
  | { series: FiaDocumentSeries; status: "idle" }
  | { series: FiaDocumentSeries; status: "no-match"; roundId: string; event: string }
  | { series: FiaDocumentSeries; status: "ok"; roundId: string; found: number; added: number; toNotify: number }
  | { series: FiaDocumentSeries; status: "failed"; error: string };

/** The Rounds whose watch window (a few days either side of their dates) contains `now`. */
export function watchedRounds(entries: readonly WatchedRound[], now: Date): WatchedRound[] {
  const today = now.toISOString().slice(0, 10);
  const byId = new Map<string, WatchedRound>();
  for (const entry of entries) {
    const { round } = entry;
    if (today >= addDays(round.startDate, -WATCH_BEFORE_DAYS) && today <= addDays(round.endDate, WATCH_AFTER_DAYS)) {
      byId.set(round.id, entry);
    }
  }
  return [...byId.values()];
}

/**
 * Rows for a listing's documents. A document is left unnotified (to be pushed) only if it was
 * published within DOCUMENT_ALERT_FRESH_MINUTES; one with no readable publish time only when the
 * Round was already being watched, since it can then only be new.
 */
export function documentRows(
  listing: FiaEventDocuments,
  round: Round,
  now: Date,
  options: { firstLook: boolean },
): (typeof fiaDocuments.$inferInsert)[] {
  return listing.documents.map((doc) => {
    const publishedAt = doc.publishedAt ? new Date(doc.publishedAt) : null;
    const fresh = publishedAt ? now.getTime() - publishedAt.getTime() <= DOCUMENT_ALERT_FRESH_MINUTES * MINUTE : !options.firstLook;
    return {
      url: doc.url,
      series: round.series as FiaDocumentSeries,
      roundId: round.id,
      event: listing.event,
      number: doc.number,
      title: doc.title,
      kind: doc.kind,
      file: doc.file,
      publishedAt,
      firstSeenAt: now,
      notifiedAt: fresh ? null : now,
    };
  });
}

/** Inserts the listing's documents not seen before. Documents already recorded are left as they are. */
export async function recordDocuments(
  db: Db,
  listing: FiaEventDocuments,
  round: Round,
  now: Date,
): Promise<{ found: number; added: number; toNotify: number }> {
  const seen = await db.select({ url: fiaDocuments.url }).from(fiaDocuments).where(eq(fiaDocuments.roundId, round.id)).limit(1);
  const rows = documentRows(listing, round, now, { firstLook: seen.length === 0 });
  const inserted = rows.length
    ? await db.insert(fiaDocuments).values(rows).onConflictDoNothing().returning({ url: fiaDocuments.url, notifiedAt: fiaDocuments.notifiedAt })
    : [];
  return { found: rows.length, added: inserted.length, toNotify: inserted.filter((r) => r.notifiedAt === null).length };
}

/** Checks fia.com for a Series if one of its Rounds is in its watch window, recording any new documents. */
export async function syncFiaDocuments(
  db: Db,
  series: FiaDocumentSeries,
  now: Date,
  ctx: SourceContext = defaultContext,
): Promise<DocumentsSyncResult> {
  try {
    const entries = (await listCalendarSessions([series], now)).map(({ round, circuit }) => ({ round, circuit }));
    const watched = watchedRounds(entries, now);
    if (watched.length === 0) return { series, status: "idle" };

    const listing = await fetchFiaDocuments(ctx, series);
    // Back-to-back Rounds can both be in their windows; the FIA's latest event says which one is live.
    const match = watched.find(({ round, circuit }) => eventMatchesRound(listing, round, circuit));
    if (!match) return { series, status: "no-match", roundId: watched[0].round.id, event: listing.event };

    return { series, status: "ok", roundId: match.round.id, ...(await recordDocuments(db, listing, match.round, now)) };
  } catch (error) {
    console.warn(`[documents:${series}] sync failed: ${errorMessage(error)}`);
    return { series, status: "failed", error: errorMessage(error) };
  }
}
