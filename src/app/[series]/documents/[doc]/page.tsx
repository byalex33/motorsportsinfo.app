import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeftIcon, DownloadIcon } from "lucide-react";
import { DocumentPublished } from "@/components/documents/document-published";
import { PdfViewer } from "@/components/documents/pdf-viewer";
import { PageTransition } from "@/components/motion/page-transition";
import { SERIES } from "@/domain/series";
import type { FiaDocument, FiaDocumentSeries } from "@/domain/types";
import { fiaDocumentPdfPath } from "@/lib/fia-document-path";
import { ENTER, enterDelay } from "@/lib/motion";
import { isSeriesId } from "@/lib/series-id";
import { fiaDocumentFileFromSlug, fiaDocumentSource, fiaDocumentsUrl, hasFiaDocuments } from "@/server/documents";
import { getSeriesPageData } from "../../data";

// One FIA Document, rendered in the page by PDF.js from our /documents relay. The document is only known
// at request time, so there is no static shell to show first (the site header reads the pathname):
// instant = false lets navigations here wait for the server render, as on the Series pages.
export const instant = false;

interface FoundDocument {
  series: FiaDocumentSeries;
  file: string;
  /** From the Featured Round's listing; null for a document no longer listed (an older link). */
  doc: FiaDocument | null;
  event: string | null;
  circuitTimeZone: string | null;
}

async function findDocument(seriesParam: string, slug: string): Promise<FoundDocument | null> {
  if (!isSeriesId(seriesParam) || !hasFiaDocuments(seriesParam)) return null;
  const file = fiaDocumentFileFromSlug(slug);
  if (!file) return null;
  const { featured, documents } = await getSeriesPageData(seriesParam);
  const listed = documents?.kind === "documents" ? documents : null;
  return {
    series: seriesParam,
    file,
    doc: listed?.documents.find((d) => d.file === file) ?? null,
    event: listed?.event ?? null,
    circuitTimeZone: featured.kind === "round" ? featured.circuit.timeZone : null,
  };
}

/** A readable title from the file name alone: "2026_baku_event_-_entry_list.pdf" → "Baku event – entry list". */
function titleFromFile(file: string): string {
  const words = file
    .replace(/\.pdf$/i, "")
    .replace(/^\d{4}_/, "")
    .replace(/_-_/g, " – ")
    .replace(/_/g, " ")
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export async function generateMetadata({ params }: PageProps<"/[series]/documents/[doc]">): Promise<Metadata> {
  const { series, doc } = await params;
  const found = await findDocument(series, doc);
  // The FIA publishes these; search engines should find them on fia.com, not here.
  const robots = { index: false, follow: true };
  if (!found) return { robots };
  const title = found.doc?.title ?? titleFromFile(found.file);
  const where = found.doc && found.event ? ` · ${SERIES[found.series].shortName} ${found.event}` : ` · ${SERIES[found.series].shortName}`;
  return { title: `${title}${where}`, description: `FIA document: ${title}.`, robots };
}

// A bad link shows the not-found page but answers 200: the root layout's shell has been sent by the
// time the params are read. Viewer pages are noindex, so that only matters to people, not crawlers.
export default function DocumentPage({ params }: PageProps<"/[series]/documents/[doc]">) {
  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-8 pb-20 sm:px-6 sm:pt-12">
        <Suspense fallback={<DocumentSkeleton />}>
          <DocumentView params={params} />
        </Suspense>
      </main>
    </PageTransition>
  );
}

async function DocumentView({ params }: { params: PageProps<"/[series]/documents/[doc]">["params"] }) {
  const { series: seriesParam, doc: slug } = await params;
  const found = await findDocument(seriesParam, slug);
  if (!found) notFound();

  const { series, file, doc, event, circuitTimeZone } = found;
  const info = SERIES[series];
  const source = fiaDocumentSource(file)!;
  const title = doc?.title ?? titleFromFile(file);

  return (
    <div data-series={series}>
      <Link
        href={`/${series}`}
        className="enter-rise inline-flex items-center gap-2 rounded-full py-1 pr-3 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        style={enterDelay(ENTER.eyebrow)}
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        {info.shortName}
        {event && doc ? ` ${event}` : ""} documents
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
  );
}

function DocumentSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading document">
      <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
      <div className="mt-6 space-y-3">
        <div className="h-4 w-32 animate-pulse rounded-md bg-muted" />
        <div className="h-9 w-4/5 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="mt-8 aspect-[1/1.414] w-full animate-pulse rounded-sm bg-muted" />
    </div>
  );
}
