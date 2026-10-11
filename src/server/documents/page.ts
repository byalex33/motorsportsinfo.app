// Which FIA Document a viewer page (/<series>/documents/<slug>) shows. Pure: the page passes in the
// Featured Round's listing. Pages are addressed by event and number ("singapore-grand-prix-73", see
// lib/fia-document-path); older links named the PDF file instead, which spelled out spoilers, and
// pushes and shared links with those still arrive.
import type { FiaDocument } from "@/domain/types";
import { fiaDocumentIds, fiaEventSlug, parseFiaDocumentPageSlug } from "@/lib/fia-document-path";
import { fiaDocumentFileFromSlug } from "./viewer";

export interface DocumentListing {
  /** The FIA's name for the Round, e.g. "Singapore Grand Prix". */
  event: string;
  documents: readonly FiaDocument[];
}

export type DocumentPageMatch =
  /** A document in the Featured Round's listing. */
  | { kind: "listed"; doc: FiaDocument & { file: string } }
  /** A file-name slug for a listed document: its page has moved to `id`. */
  | { kind: "moved"; id: string }
  /** A file-name slug for a document no longer listed (an earlier Round): it may still be on fia.com. */
  | { kind: "unlisted"; file: string }
  | { kind: "unknown" };

export function matchDocumentPage(slug: string, listing: DocumentListing | null): DocumentPageMatch {
  const ids = listing ? fiaDocumentIds(listing.documents) : [];
  const page = parseFiaDocumentPageSlug(slug);
  if (page) {
    // FIA file names always have underscores, which a page slug never does, so this is not an older link.
    if (!listing || page.event !== fiaEventSlug(listing.event)) return { kind: "unknown" };
    const doc = listing.documents[ids.indexOf(page.id)];
    return doc?.file ? { kind: "listed", doc: { ...doc, file: doc.file } } : { kind: "unknown" };
  }

  const file = fiaDocumentFileFromSlug(slug);
  if (!file) return { kind: "unknown" };
  const index = listing ? listing.documents.findIndex((d) => d.file === file) : -1;
  return index >= 0 ? { kind: "moved", id: ids[index] } : { kind: "unlisted", file };
}
