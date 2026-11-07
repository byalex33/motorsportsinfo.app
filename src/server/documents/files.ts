// FIA Document files on fia.com. The site never fetches, stores or relays the PDFs: it links to them in the
// FIA's decision-document folder (see /<series>/documents/<slug> and /documents/<file>.pdf, which redirect
// there). Only bare PDF file names in that folder are linked: the host and folder are fixed here.

export const FIA_DOCUMENT_FOLDER = "https://www.fia.com/system/files/decision-document/";

/** A bare PDF file name: no folders, no control characters, not hidden. */
function isDocumentFile(file: string): boolean {
  return /^[^/\\?#\u0000-\u001f.][^/\\?#\u0000-\u001f]*\.pdf$/i.test(file);
}

/** The fia.com URL of a document file, or null if the name is not a plain PDF file name. */
export function fiaDocumentSource(file: string): string | null {
  return isDocumentFile(file) ? FIA_DOCUMENT_FOLDER + encodeURIComponent(file) : null;
}

/** The file name of a PDF in the FIA's decision-document folder, or null for any other URL. */
export function fiaDocumentFile(url: string): string | null {
  let pathname: string;
  try {
    const parsed = new URL(url);
    if (parsed.origin !== new URL(FIA_DOCUMENT_FOLDER).origin) return null;
    pathname = parsed.pathname;
  } catch {
    return null;
  }
  const folder = new URL(FIA_DOCUMENT_FOLDER).pathname;
  if (!pathname.startsWith(folder)) return null;
  try {
    const file = decodeURIComponent(pathname.slice(folder.length));
    return isDocumentFile(file) ? file : null;
  } catch {
    return null;
  }
}

/** The file name a viewer page slug stands for ("2026_…_entry_list" → "2026_…_entry_list.pdf"), or null. */
export function fiaDocumentFileFromSlug(slug: string): string | null {
  let name = slug;
  try {
    name = decodeURIComponent(slug);
  } catch {
    // Already decoded, or not encoded at all.
  }
  const file = `${name}.pdf`;
  return isDocumentFile(file) ? file : null;
}
