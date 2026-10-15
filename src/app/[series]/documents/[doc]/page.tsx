import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeftIcon, DownloadIcon } from "lucide-react";
import { DocumentPublished } from "@/components/documents/document-published";
import { PdfViewer } from "@/components/documents/pdf-viewer";
import { PageTransition } from "@/components/motion/page-transition";
import { SERIES } from "@/domain/series";
import { FIA_DOCUMENT_SERIES, type FiaDocument, type FiaDocumentSeries } from "@/domain/types";
import { fiaDocumentIds, fiaDocumentPagePath, fiaDocumentPageSlug, fiaDocumentPdfPath } from "@/lib/fia-document-path";
import { hideCarNumbers, titleFromFile } from "@/lib/fia-document-title";
import { ENTER, enterDelay } from "@/lib/motion";
import { isSeriesId } from "@/lib/series-id";
import { fiaDocumentExists, fiaDocumentSource, fiaDocumentsUrl, hasFiaDocuments, matchDocumentPage } from "@/server/documents";
import { getSeriesPageData } from "../../data";

// One FIA Document, rendered in the page by PDF.js from our /documents relay. Static like the Series pages:
// each document page is generated on its first request from the cached listing and kept (~5 min
// revalidation). `params` is read outside <Suspense> on purpose: ensureStatic = "navigation" makes an
// unknown document wait for its render, so notFound() and the redirect for older links run before anything
// streams and answer a real 404 or 308. instant = false: there is no App Shell to validate.
export const ensureStatic = "navigation";
export const instant = false;

type Params = PageProps<"/[series]/documents/[doc]">["params"];

/** The newest document of each Series that has one listed; the rest are generated on request. */
export async function generateStaticParams() {
  const params: { series: FiaDocumentSeries; doc: string }[] = [];
  for (const series of FIA_DOCUMENT_SERIES) {
    const { documents } = await getSeriesPageData(series);
    if (documents?.kind !== "documents") continue;
    const index = documents.documents.findIndex((d) => d.file);
    if (index < 0) continue;
    params.push({ series, doc: fiaDocumentPageSlug(documents.event, fiaDocumentIds(documents.documents)[index]) });
  }
  // A build must list at least one; with nothing listed anywhere, this one renders the not-found page.
  return params.length ? params : [{ series: "f1", doc: "none-0" }];
}

type FoundDocument =
  | { kind: "page"; series: FiaDocumentSeries; file: string; doc: FiaDocument | null; event: string | null; circuitTimeZone: string | null }
  | { kind: "moved"; path: string };

async function findDocument(params: Params): Promise<FoundDocument | null> {
  const { series, doc: slug } = await params;
  if (!isSeriesId(series) || !hasFiaDocuments(series)) return null;
  const { featured, documents } = await getSeriesPageData(series);
  const listing = documents?.kind === "documents" ? documents : null;
  const match = matchDocumentPage(slug, listing);
  switch (match.kind) {
    case "listed":
      return {
        kind: "page",
        series,
        file: match.doc.file,
        doc: match.doc,
        event: listing!.event,
        circuitTimeZone: featured.kind === "round" ? featured.circuit.timeZone : null,
      };
    case "moved":
      return { kind: "moved", path: fiaDocumentPagePath(series, listing!.event, match.id) };
    case "unlisted":
      // An older link to an earlier Round's document: shown from the file alone, as long as fia.com has it.
      if (!(await fiaDocumentExists(match.file))) return null;
      return { kind: "page", series, file: match.file, doc: null, event: null, circuitTimeZone: null };
    case "unknown":
      return null;
  }
}

export async function generateMetadata({ params }: PageProps<"/[series]/documents/[doc]">): Promise<Metadata> {
  const found = await findDocument(params);
  // The FIA publishes these; search engines should find them on fia.com, not here.
  const robots = { index: false, follow: true };
  if (!found) notFound(); // for not-found.tsx's title (see src/app/[series]/page.tsx)
  if (found.kind !== "page") return { robots };
  // The tab, history and a shared link's preview card show the title before anyone chooses to read it,
  // so car numbers stay hidden there, as in the list. The page itself shows the full title.
  const title = hideCarNumbers(found.doc?.title ?? titleFromFile(found.file));
  const label = found.doc?.number != null ? `Doc ${found.doc.number} · ` : "";
  const where = found.event ? ` · ${SERIES[found.series].shortName} ${found.event}` : ` · ${SERIES[found.series].shortName}`;
  return { title: `${label}${title}${where}`, description: `FIA document: ${title}.`, robots };
}

export default async function DocumentPage({ params }: PageProps<"/[series]/documents/[doc]">) {
  const found = await findDocument(params);
  if (!found) notFound();
  if (found.kind === "moved") permanentRedirect(found.path);

  const { series, file, doc, event, circuitTimeZone } = found;
  const info = SERIES[series];
  const source = fiaDocumentSource(file)!;
  const title = doc?.title ?? titleFromFile(file);

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-8 pb-20 sm:px-6 sm:pt-12">
        <div data-series={series}>
          <Link
            href={`/${series}`}
            className="enter-rise inline-flex items-center gap-2 rounded-full py-1 pr-3 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            style={enterDelay(ENTER.eyebrow)}
          >
            <ArrowLeftIcon className="size-4" aria-hidden />
            {info.shortName}
            {event ? ` ${event}` : ""} documents
          </Link>

          <header className="mt-6 space-y-3">
            <p className="eyebrow enter-rise flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground" style={enterDelay(ENTER.eyebrow + 30)}>
              <span aria-hidden className="size-1.5 rounded-full bg-series-accent" />
              FIA document
              {doc?.number != null && <span className="tabular">· Doc {doc.number}</span>}
              {doc?.kind === "stewards" && <span className="chip border border-series-accent/60 text-series-accent">Stewards</span>}
            </p>
            <h1 className="enter-rise text-2xl leading-tight font-semibold tracking-[-0.03em] text-balance sm:text-3xl" style={enterDelay(ENTER.title)}>
              {title}
            </h1>
            <div className="enter-rise flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground" style={enterDelay(ENTER.meta)}>
              {doc?.publishedAt && circuitTimeZone && <DocumentPublished at={doc.publishedAt} circuitTimeZone={circuitTimeZone} />}
              <a href={source} className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
                <DownloadIcon className="size-4" aria-hidden />
                Download PDF
              </a>
            </div>
          </header>

          <div className="enter-rise mt-8" style={enterDelay(ENTER.body)}>
            <PdfViewer src={fiaDocumentPdfPath(file)} fallbackHref={source} />
          </div>

          <p className="enter-fade mt-10 text-center font-mono text-[0.6875rem] tracking-[0.04em] text-muted-foreground" style={enterDelay(ENTER.rows + 160)}>
            <a className="transition-colors hover:text-foreground" href={fiaDocumentsUrl(series) ?? source} target="_blank" rel="noopener noreferrer">
              Documents: FIA
            </a>
          </p>
        </div>
      </main>
    </PageTransition>
  );
}
