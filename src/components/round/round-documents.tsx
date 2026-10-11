import { FileClockIcon, FileWarningIcon } from "lucide-react";
import type { RoundDocumentsResult, SeriesId } from "@/domain/types";
import { fiaDocumentIds, fiaDocumentPagePath } from "@/lib/fia-document-path";
import { ENTER, enterDelay } from "@/lib/motion";
import { RoundDocumentList, type DocumentListRow } from "./round-document-list";

interface RoundDocumentsProps {
  series: SeriesId;
  documents: RoundDocumentsResult;
  circuitTimeZone: string;
}

/**
 * The FIA's documents for the Featured Round, newest first, opening in our viewer page. A server component:
 * only what a row shows goes to the browser, not the listing's fia.com URLs and file names.
 */
export function RoundDocuments({ series, documents, circuitTimeZone }: RoundDocumentsProps) {
  const count = documents.kind === "documents" ? documents.documents.length : 0;

  return (
    // id="documents": a Document Alert summary push opens /<series>#documents.
    <section id="documents" aria-labelledby="documents-heading" className="scroll-mt-24 space-y-5">
      <div className="enter-rise flex items-baseline justify-between gap-4" style={enterDelay(ENTER.rows + 60)}>
        <h2 id="documents-heading" className="eyebrow text-muted-foreground">
          FIA documents
        </h2>
        {count > 0 && (
          <p className="eyebrow text-muted-foreground tabular">
            {count} document{count === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {documents.kind === "documents" ? (
        <RoundDocumentList series={series} rows={listRows(series, documents)} circuitTimeZone={circuitTimeZone} />
      ) : (
        <p
          className="enter-rise flex items-start justify-center gap-2.5 border-y border-border px-4 py-10 text-center text-sm text-pretty text-muted-foreground"
          style={enterDelay(ENTER.rows + 90)}
        >
          {documents.kind === "none" ? (
            <>
              <FileClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Stewards&apos; decisions, classifications and notes will appear here as the FIA publishes them for this Round.</span>
            </>
          ) : (
            <>
              <FileWarningIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>The FIA documents could not be loaded just now. They are on fia.com in the meantime.</span>
            </>
          )}
        </p>
      )}

      <p className="enter-fade text-center font-mono text-[0.6875rem] tracking-[0.04em] text-muted-foreground" style={enterDelay(ENTER.rows + 160)}>
        <a className="transition-colors hover:text-foreground" href={documents.sourceUrl} target="_blank" rel="noopener noreferrer">
          Documents: FIA
        </a>
      </p>
    </section>
  );
}

/** Documents in the FIA's folder open in our viewer page; anything else links to fia.com. */
function listRows(series: SeriesId, { event, documents }: Extract<RoundDocumentsResult, { kind: "documents" }>): DocumentListRow[] {
  const ids = fiaDocumentIds(documents);
  return documents.map((doc, i) => ({
    number: doc.number,
    title: doc.title,
    kind: doc.kind,
    publishedAt: doc.publishedAt,
    href: doc.file ? fiaDocumentPagePath(series, event, ids[i]) : doc.url,
  }));
}
