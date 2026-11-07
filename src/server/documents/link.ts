// Which FIA Document a document link (/<series>/documents/<slug>) stands for. Pure: the caller passes in the
// Series' current fia.com listing. Links are addressed by event and number ("singapore-grand-prix-73", see
// lib/fia-document-path), so the URL never spells out a spoiler; older links named the PDF file instead,
// and pushes and shared links with those still arrive.
import type { FiaDocument } from "@/domain/types";
import { fiaDocumentIds, fiaEventSlug, parseFiaDocumentPageSlug } from "@/lib/fia-document-path";
import { fiaDocumentFileFromSlug } from "./files";

export interface DocumentListing {
  /** The FIA's name for the Round, e.g. "Singapore Grand Prix". */
  event: string;
  documents: readonly FiaDocument[];
}

export type DocumentLinkMatch =
  /** A listed document, or an older link naming the file itself. */
  | { kind: "file"; file: string }
  /** An event and number not in this listing: an earlier Round's link, to look up elsewhere. */
  | { kind: "elsewhere"; event: string; id: string }
  | { kind: "unknown" };

export function matchDocumentLink(slug: string, listing: DocumentListing | null): DocumentLinkMatch {
  const page = parseFiaDocumentPageSlug(slug);
  if (page) {
    // FIA file names always have underscores, which an event-and-number slug never does.
    if (listing && page.event === fiaEventSlug(listing.event)) {
      const doc = listing.documents[fiaDocumentIds(listing.documents).indexOf(page.id)];
      if (doc?.file) return { kind: "file", file: doc.file };
    }
    return { kind: "elsewhere", event: page.event, id: page.id };
  }
  const file = fiaDocumentFileFromSlug(slug);
  return file ? { kind: "file", file } : { kind: "unknown" };
}
