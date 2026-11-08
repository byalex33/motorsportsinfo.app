// CONTRACT — owned by the documents work. UI code imports only from here.
// FIA documents (stewards' decisions, classifications, notes) for F1, F2 and F3. We list titles and publish
// times, and link to the FIA's own PDFs on fia.com (see files.ts); the PDFs are never fetched, stored or
// relayed. See ADR 0001.
import { and, eq, isNotNull } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { fiaDocuments } from "@/db/schema";
import { fiaDocumentId, fiaEventSlug } from "@/lib/fia-document-path";
import { FIA_DOCUMENT_SERIES, type Circuit, type FiaDocumentSeries, type Round, type RoundDocumentsResult, type SeriesId } from "@/domain/types";
import { defaultContext, errorMessage } from "@/server/schedule/sources/http";
import { eventMatchesRound, fetchFiaDocuments, FIA_DOCUMENT_PAGES, type FiaEventDocuments } from "./fia";
import { fiaDocumentsTag } from "./tags";
import { fiaDocumentSource } from "./files";
import { matchDocumentLink } from "./link";

export { syncFiaDocuments, type DocumentsSyncResult } from "./sync";
export { fiaDocumentsTag } from "./tags";
export { fiaDocumentSource } from "./files";


/** Failures are cached briefly: a retry a minute later, without hammering fia.com while it is down. */
const FAILURE_LIFE = { stale: 60, revalidate: 60, expire: 300 };

type LoadedListing = { ok: true; listing: FiaEventDocuments } | { ok: false };

export function hasFiaDocuments(series: SeriesId): series is FiaDocumentSeries {
  return (FIA_DOCUMENT_SERIES as readonly string[]).includes(series);
}

/** The fia.com documents page for a Series, or null if the FIA publishes none there. */
export function fiaDocumentsUrl(series: SeriesId): string | null {
  return hasFiaDocuments(series) ? FIA_DOCUMENT_PAGES[series] : null;
}

/**
 * The FIA's documents for a Round, or null for a Series the FIA publishes none for.
 * Never throws: failures become `{ kind: "unavailable" }`.
 */
export async function getRoundDocuments(round: Round, circuit: Circuit): Promise<RoundDocumentsResult | null> {
  if (!hasFiaDocuments(round.series)) return null;
  const sourceUrl = FIA_DOCUMENT_PAGES[round.series];
  const loaded = await seriesListing(round.series);
  if (!loaded.ok) return { kind: "unavailable", sourceUrl };
  const { listing } = loaded;
  if (listing.documents.length === 0 || !eventMatchesRound(listing, round, circuit)) return { kind: "none", sourceUrl };
  return { kind: "documents", event: listing.event, documents: listing.documents, sourceUrl };
}

// One fia.com request per Series, shared by every caller until it revalidates. The Series page
// cache around it sets the page's own lifetime (~5 minutes), so new documents show within that.
async function seriesListing(series: FiaDocumentSeries): Promise<LoadedListing> {
  "use cache";
  cacheTag(fiaDocumentsTag(series));
  try {
    const listing = await fetchFiaDocuments(defaultContext, series);
    cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
    return { ok: true, listing };
  } catch (error) {
    console.warn(`[documents:${series}] fia.com request failed: ${errorMessage(error)}`);
    cacheLife(FAILURE_LIFE);
    return { ok: false };
  }
}

/**
 * Where a document link (/<series>/documents/<slug>) goes: the PDF on fia.com, or null when the slug names
 * no document we know. The Series' current fia.com listing is checked first, then fia_documents (kept for
 * 30 days by the sync) for an earlier Round's link, such as one in a Document Alert.
 */
export async function fiaDocumentLink(series: FiaDocumentSeries, slug: string): Promise<string | null> {
  const loaded = await seriesListing(series);
  const match = matchDocumentLink(slug, loaded.ok ? loaded.listing : null);
  if (match.kind === "file") return fiaDocumentSource(match.file);
  if (match.kind === "unknown") return null;

  const db = getDb();
  if (!db) return null;
  try {
    const number = /^\d+$/.test(match.id) ? Number(match.id) : null;
    const rows = await db
      .select({ event: fiaDocuments.event, number: fiaDocuments.number, file: fiaDocuments.file })
      .from(fiaDocuments)
      .where(and(eq(fiaDocuments.series, series), isNotNull(fiaDocuments.file), number === null ? undefined : eq(fiaDocuments.number, number)));
    const row = rows.find((r) => fiaEventSlug(r.event) === match.event && fiaDocumentId(r) === match.id);
    return row?.file ? fiaDocumentSource(row.file) : null;
  } catch (error) {
    console.warn(`[documents] fia_documents lookup failed: ${errorMessage(error)}`);
    return null;
  }
}
