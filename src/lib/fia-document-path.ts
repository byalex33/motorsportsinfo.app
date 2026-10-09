// Same-origin paths for an FIA Document, shared by the server and the browser. `file` is the PDF's
// name in the FIA's decision-document folder, e.g. "2026_singapore_grand_prix_-_entry_list.pdf".
import type { SeriesId } from "@/domain/types";

/** The viewer page: /f1/documents/2026_singapore_grand_prix_-_entry_list */
export function fiaDocumentPagePath(series: SeriesId, file: string): string {
  return `/${series}/documents/${encodeURIComponent(file.replace(/\.pdf$/i, ""))}`;
}

/** The PDF itself, relayed from fia.com so it can be shown inline: /documents/2026_…_entry_list.pdf */
export function fiaDocumentPdfPath(file: string): string {
  return `/documents/${encodeURIComponent(file)}`;
}
