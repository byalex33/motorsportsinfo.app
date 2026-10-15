// CONTRACT — owned by the documents work. UI code imports only from here.
// FIA documents (stewards' decisions, classifications, notes) for F1, F2 and F3. We list titles and
// open the FIA's PDFs in the browser through /documents (see viewer.ts); nothing is stored. See ADR 0001.
import { eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { fiaDocuments } from "@/db/schema";
import { FIA_DOCUMENT_SERIES, type Circuit, type FiaDocumentSeries, type Round, type RoundDocumentsResult, type SeriesId } from "@/domain/types";
import { defaultContext, errorMessage } from "@/server/schedule/sources/http";
import { eventMatchesRound, fetchFiaDocuments, FIA_DOCUMENT_PAGES, type FiaEventDocuments } from "./fia";
import { checkFiaDocument } from "./viewer";

export { matchDocumentPage, type DocumentPageMatch } from "./page";
export { syncFiaDocuments, type DocumentsSyncResult } from "./sync";
export { fiaDocumentSource, serveFiaDocument } from "./viewer";

/** Cache tag for a Series' fia.com listing. The sync revalidates it when it records new documents. */
export function fiaDocumentsTag(series: FiaDocumentSeries): string {
  return `fia-documents:${series}`;
}

/** Failures are cached briefly: a retry a minute later, without hammering fia.com while it is down. */
const FAILURE_LIFE = { stale: 60, revalidate: 60, expire: 300 };
/** The FIA issues corrections as new files, so a file it has stays there. */
const FILE_FOUND_LIFE = { stale: 3600, revalidate: 86_400, expire: 7 * 86_400 };
const FILE_MISSING_LIFE = { stale: 300, revalidate: 3600, expire: 86_400 };

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
 * Whether a document file no longer in the listing is still on fia.com, for older viewer links. Only a
 * clear "not there" counts as missing: if fia.com can't be asked, the page is shown and asked again soon.
 */
export async function fiaDocumentExists(file: string): Promise<boolean> {
  "use cache";
  const status = await checkFiaDocument(file);
  cacheLife(status === "found" ? FILE_FOUND_LIFE : status === "missing" ? FILE_MISSING_LIFE : FAILURE_LIFE);
  return status !== "missing";
}

/**
 * Whether /documents may relay a file: one the site has linked to, so a made-up name never reaches fia.com.
 * Known means in a Series' current fia.com listing (cached), or recorded in fia_documents by the sync, which
 * keeps every document listed during a Round, so older viewer links still open. Without a database (local
 * dev) or when it can't be read, the cached fia.com check an older link's viewer page makes decides instead.
 */
export async function isKnownDocumentFile(file: string): Promise<boolean> {
  const listings = await Promise.all(FIA_DOCUMENT_SERIES.map(seriesListing));
  if (listings.some((loaded) => loaded.ok && loaded.listing.documents.some((d) => d.file === file))) return true;

  const db = getDb();
  if (db) {
    try {
      const rows = await db.select({ file: fiaDocuments.file }).from(fiaDocuments).where(eq(fiaDocuments.file, file)).limit(1);
      return rows.length > 0;
    } catch (error) {
      console.warn(`[documents] fia_documents lookup failed: ${errorMessage(error)}`);
    }
  }
  return fiaDocumentExists(file);
}
