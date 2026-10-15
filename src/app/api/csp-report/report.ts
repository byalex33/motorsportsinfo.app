// Content Security Policy violation reports, as browsers send them to /api/csp-report: the older
// application/csp-report shape ({ "csp-report": { … } }, what report-uri sends) and the Reporting API's
// application/reports+json (an array of { type: "csp-violation", body: { … } }). Each report becomes one
// short log line; nothing else from the request (cookies, the full page URL, the script sample) is kept.

/** Larger bodies are refused unread: a real report is well under 2 KB. */
export const MAX_REPORT_BYTES = 8 * 1024;
/** A body may batch several reports; past this many, the rest are dropped. */
const MAX_REPORTS = 10;
const MAX_FIELD = 200;

export interface CspReport {
  directive: string;
  blocked: string;
  /** The page's path, without its query. */
  page: string;
  line: number | null;
}

/** The reports in a parsed body, in either shape; anything else gives none. */
export function parseCspReports(body: unknown): CspReport[] {
  const raw: Record<string, unknown>[] = [];
  if (isObject(body) && isObject(body["csp-report"])) {
    const r = body["csp-report"];
    raw.push({
      directive: r["effective-directive"] ?? r["violated-directive"],
      blocked: r["blocked-uri"],
      page: r["document-uri"],
      line: r["line-number"],
    });
  } else if (Array.isArray(body)) {
    for (const entry of body) {
      if (!isObject(entry) || entry.type !== "csp-violation" || !isObject(entry.body)) continue;
      const r = entry.body;
      raw.push({ directive: r.effectiveDirective, blocked: r.blockedURL, page: r.documentURL ?? entry.url, line: r.lineNumber });
    }
  }
  return raw.slice(0, MAX_REPORTS).map((r) => ({
    directive: text(r.directive),
    blocked: withoutQuery(text(r.blocked), false),
    page: withoutQuery(text(r.page), true),
    line: typeof r.line === "number" && Number.isInteger(r.line) && r.line >= 0 ? r.line : null,
  }));
}

/** e.g. `[csp] script-src-elem blocked https://evil.example/x.js on /f1 line 12`. */
export function cspReportLine(report: CspReport): string {
  const line = report.line != null ? ` line ${report.line}` : "";
  return `[csp] ${report.directive || "?"} blocked ${report.blocked || "?"} on ${report.page || "?"}${line}`;
}

/**
 * The body as text, or null once it passes `max` bytes (read no further). The Content-Length header is
 * checked first, but a chunked body has none, so the count is kept while reading too.
 */
export async function readCappedBody(request: Request, max = MAX_REPORT_BYTES): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A string field, on one line and trimmed, so a report can't forge or flood log lines. */
function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, MAX_FIELD) : "";
}

/** A URL without its query and fragment (a page path only, for the page); keywords like "inline" pass through. */
function withoutQuery(value: string, pathOnly: boolean): string {
  if (!value) return value;
  try {
    const url = new URL(value);
    return pathOnly ? url.pathname : url.protocol === "http:" || url.protocol === "https:" ? url.origin + url.pathname : url.protocol.slice(0, -1);
  } catch {
    return value.split(/[?#]/)[0];
  }
}
