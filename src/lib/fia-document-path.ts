// Same-origin paths for an FIA Document, shared by the server and the browser. `file` is the PDF's
// name in the FIA's decision-document folder, e.g. "2026_singapore_grand_prix_-_entry_list.pdf".
//
// A viewer page is addressed by the Round and the document's number, never by its file name: titles
// such as "Infringement – Car 27 – Impeding of Car 55" are spoilers, and the file name carries them.
import type { SeriesId } from "@/domain/types";

/** "Singapore Grand Prix" → "singapore-grand-prix", "São Paulo" → "sao-paulo". */
export function fiaEventSlug(event: string): string {
  const slug = event
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "round";
}

/** FNV-1a: a short, stable, non-reversible tag for a file name. */
function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** A document's id within its Round: its number ("73"), or "h" and a hash of its file when it has none. */
export function fiaDocumentId(doc: { number: number | null; file: string | null }): string {
  return doc.number !== null ? String(doc.number) : `h${shortHash(doc.file ?? "")}`;
}

/**
 * The ids of a Round's listed documents, in order. A number the FIA reuses (a re-issued document) stays
 * with the newest, which the listing has first; older ones fall back to their hash.
 */
export function fiaDocumentIds(documents: readonly { number: number | null; file: string | null }[]): string[] {
  const taken = new Set<number>();
  return documents.map((doc) => {
    if (doc.number !== null && !taken.has(doc.number)) {
      taken.add(doc.number);
      return String(doc.number);
    }
    return fiaDocumentId({ number: null, file: doc.file });
  });
}

/** The last part of a viewer page's path: "singapore-grand-prix-73". */
export function fiaDocumentPageSlug(event: string, id: string): string {
  return `${fiaEventSlug(event)}-${id}`;
}

/** The viewer page: /f1/documents/singapore-grand-prix-73 for Doc 73 of the FIA's "Singapore Grand Prix". */
export function fiaDocumentPagePath(series: SeriesId, event: string, id: string): string {
  return `/${series}/documents/${fiaDocumentPageSlug(event, id)}`;
}

// The id is the last part, so an event slug may itself end in a number ("round-3-12").
const PAGE_SLUG = /^([a-z0-9]+(?:-[a-z0-9]+)*)-(\d{1,4}|h[0-9a-f]{8})$/;

/** The event slug and document id a viewer page slug names, or null for anything else (such as an older file-name slug). */
export function parseFiaDocumentPageSlug(slug: string): { event: string; id: string } | null {
  const m = PAGE_SLUG.exec(slug);
  return m ? { event: m[1], id: m[2] } : null;
}

/** The PDF itself, relayed from fia.com so it can be shown inline: /documents/2026_…_entry_list.pdf */
export function fiaDocumentPdfPath(file: string): string {
  return `/documents/${encodeURIComponent(file)}`;
}
