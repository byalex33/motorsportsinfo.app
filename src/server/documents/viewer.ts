// FIA Document PDFs, relayed from fia.com. fia.com serves every PDF with "Content-Disposition:
// attachment", so a link to it always downloads. /documents/<file>.pdf fetches the same PDF and relays
// it unchanged with an inline disposition, for the viewer page (/<series>/documents/<doc>) to render.
// Only files in the FIA's decision-document folder are fetched: the host and folder are fixed here,
// the file name is checked.
import { BROWSER_USER_AGENT, type Fetcher } from "@/server/schedule/sources/http";

export const FIA_DOCUMENT_FOLDER = "https://www.fia.com/system/files/decision-document/";
/** Larger files (none seen so far) go straight to fia.com instead of through us. */
const MAX_BYTES = 25 * 1024 * 1024;
/** The FIA issues corrections as new files ("… V2"), so an hour at the CDN is safe. */
const CACHE_CONTROL = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

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

/** The download name fia.com gives ("2026 Singapore Grand Prix - Entry List.pdf"), or the file name. */
function downloadName(disposition: string | null, file: string): string {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? "");
  let name = file;
  if (m) {
    try {
      name = decodeURIComponent(m[1].trim());
    } catch {
      name = m[1].trim();
    }
  }
  return isDocumentFile(name) ? name : file;
}

function inlineDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

const notFound = () =>
  new Response("No such FIA document.\n", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });

/** Sends the viewer to fia.com when we cannot relay the file: they still get it, as a download. */
const toFia = (source: string) => new Response(null, { status: 302, headers: { Location: source, "Cache-Control": "no-store" } });

/** Relays one FIA Document PDF for viewing in the browser. */
export async function serveFiaDocument(file: string, fetcher: Fetcher = fetch): Promise<Response> {
  const source = fiaDocumentSource(file);
  if (!source) return notFound();

  let upstream: Response;
  try {
    upstream = await fetcher(source, {
      headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "application/pdf" },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (error) {
    console.warn(`[documents] fia.com PDF request failed for ${file}:`, error);
    return toFia(source);
  }

  if (upstream.status === 404 || upstream.status === 410) {
    await upstream.body?.cancel();
    return notFound();
  }
  const length = Number(upstream.headers.get("content-length") ?? 0);
  const isPdf = /^application\/pdf\b/i.test(upstream.headers.get("content-type") ?? "");
  if (!upstream.ok || !isPdf || length > MAX_BYTES || !upstream.body) {
    await upstream.body?.cancel();
    return toFia(source);
  }

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": inlineDisposition(downloadName(upstream.headers.get("content-disposition"), file)),
    "Cache-Control": CACHE_CONTROL,
    "X-Content-Type-Options": "nosniff",
    // The FIA is the publisher: keep search engines on fia.com, not on our copy.
    "X-Robots-Tag": "noindex",
  });
  if (length > 0) headers.set("Content-Length", String(length));
  return new Response(upstream.body, { headers });
}
