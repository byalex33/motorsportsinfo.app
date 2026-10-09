"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, ArrowUpRightIcon, FileClockIcon, FileWarningIcon } from "lucide-react";
import { InlineSkeleton } from "@/components/inline-skeleton";
import { SegmentPill } from "@/components/motion/segment-pill";
import type { FiaDocument, FiaDocumentKind, RoundDocumentsResult, SeriesId } from "@/domain/types";
import { track } from "@/lib/analytics";
import { useNow } from "@/lib/client-stores";
import { fiaDocumentPagePath } from "@/lib/fia-document-path";
import type { DisplayZone } from "@/lib/display-zone";
import { ENTER, enterDelay, staggerDelay } from "@/lib/motion";
import { formatClock, formatSessionDay } from "@/lib/time-format";
import { cn } from "@/lib/utils";
import { SegmentButton, segmentTrack } from "./display-controls";
import { useDisplayZone } from "./use-display-zone";

type Filter = "all" | FiaDocumentKind;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "stewards", label: "Stewards" },
  { id: "results", label: "Results" },
  { id: "other", label: "Other" },
];

/** Rows shown before "Show all". A race weekend runs to 60–100 documents. */
const INITIAL_ROWS = 8;
/** A document this recent is marked New. */
const NEW_MS = 30 * 60_000;

// Columns on wider screens: number · title · published · link. Rows use subgrid so every column lines up.
const COLS = "sm:grid sm:grid-cols-[4.5rem_minmax(0,1fr)_auto_auto] sm:gap-x-6";
const ROW = "sm:col-span-4 sm:grid-cols-subgrid";

interface RoundDocumentsProps {
  series: SeriesId;
  documents: RoundDocumentsResult;
  circuitTimeZone: string;
}

/** The FIA's documents for the Featured Round, newest first, linking to the PDFs on fia.com. */
export function RoundDocuments({ series, documents, circuitTimeZone }: RoundDocumentsProps) {
  const zone = useDisplayZone(circuitTimeZone);
  const count = documents.kind === "documents" ? documents.documents.length : 0;

  return (
    <section aria-labelledby="documents-heading" className="space-y-5">
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
        <DocumentList series={series} documents={documents.documents} zone={zone} />
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

function DocumentList({ series, documents, zone }: { series: SeriesId; documents: FiaDocument[]; zone: DisplayZone | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState(false);
  const now = useNow(60_000);

  const counts: Record<Filter, number> = { all: documents.length, stewards: 0, results: 0, other: 0 };
  for (const d of documents) counts[d.kind]++;
  // Only offer filters that would leave something, and only when there is more than one kind.
  const filters = FILTERS.filter((f) => counts[f.id] > 0);
  const shown = filter === "all" ? documents : documents.filter((d) => d.kind === filter);
  const visible = expanded ? shown : shown.slice(0, INITIAL_ROWS);

  return (
    <>
      {filters.length > 2 && (
        <div className="enter-rise" style={enterDelay(ENTER.rows + 75)}>
          <div role="group" aria-label="Show documents" className={cn(segmentTrack, "w-fit max-w-full overflow-x-auto")}>
            <SegmentPill />
            {filters.map((f) => (
              <SegmentButton key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
                <span className="ml-1.5 font-mono text-[0.6875rem] tabular opacity-60">{counts[f.id]}</span>
              </SegmentButton>
            ))}
          </div>
        </div>
      )}

      <ol className={cn("divide-y divide-border border-y border-border", COLS)}>
        <li aria-hidden className={cn("eyebrow enter-rise hidden py-2.5 text-muted-foreground sm:grid", ROW)} style={staggerDelay(0, ENTER.rows + 90)}>
          <span className="pl-3">Doc</span>
          <span>Title</span>
          <span>Published</span>
          <span className="pr-3" />
        </li>
        {visible.map((doc, index) => (
          <DocumentRow
            key={doc.url}
            series={series}
            doc={doc}
            index={index}
            zone={zone}
            isNew={now !== null && !!doc.publishedAt && now - Date.parse(doc.publishedAt) < NEW_MS}
          />
        ))}
      </ol>

      {shown.length > INITIAL_ROWS && (
        <div className="flex justify-center">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="rounded-full px-4 py-1.5 text-[0.8125rem] font-medium text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {expanded ? "Show fewer" : `Show all ${shown.length}`}
          </button>
        </div>
      )}
    </>
  );
}

function DocumentRow({
  series,
  doc,
  index,
  zone,
  isNew,
}: {
  series: SeriesId;
  doc: FiaDocument;
  index: number;
  zone: DisplayZone | null;
  isNew: boolean;
}) {
  const onOpen = () => track("fia_document_opened", { series, kind: doc.kind });
  const rowClass = cn(
    "group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 py-3.5 pr-2.5 pl-2.5 transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:items-center sm:py-3.5 sm:pr-0 sm:pl-0",
    ROW,
  );
  const chips = (
    <>
      {doc.kind === "stewards" && <span className="chip border border-series-accent/60 text-series-accent">Stewards</span>}
      {isNew && <span className="chip chip-shimmer bg-series-accent text-series-accent-foreground">New</span>}
    </>
  );
  const icon = "size-4 text-muted-foreground transition-[color,translate] duration-300 ease-expo group-hover:text-foreground";

  const body = (
    <>
      <span className="pt-0.5 font-mono text-xs text-muted-foreground tabular sm:pt-0 sm:pl-3 sm:text-[0.8125rem]">
        {doc.number !== null ? String(doc.number).padStart(2, "0") : "—"}
      </span>

      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-medium tracking-tight text-pretty">{doc.title}</span>
          <span className="hidden sm:contents">{chips}</span>
        </span>
        {/* Mobile: the published time and chips share a line under the title. From sm up the time has its own column. */}
        <span className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground tabular sm:hidden">
          <Published at={doc.publishedAt} zone={zone} />
          {chips}
        </span>
      </span>

      <span className="hidden font-mono text-[0.8125rem] whitespace-nowrap text-muted-foreground tabular sm:block">
        <Published at={doc.publishedAt} zone={zone} />
      </span>

      <span className="pt-0.5 sm:pt-0 sm:pr-3">
        {doc.file ? (
          <ArrowRightIcon className={cn(icon, "group-hover:translate-x-0.5")} aria-hidden />
        ) : (
          <>
            <ArrowUpRightIcon className={cn(icon, "group-hover:translate-x-0.5 group-hover:-translate-y-0.5")} aria-hidden />
            <span className="sr-only">(PDF on fia.com, opens in a new tab)</span>
          </>
        )}
      </span>
    </>
  );

  return (
    <li className={cn("enter-rise sm:grid", ROW)} style={staggerDelay(index + 1, ENTER.rows + 90)}>
      {/* Documents in the FIA's folder open in our viewer page; anything else links to fia.com. */}
      {doc.file ? (
        <Link href={fiaDocumentPagePath(series, doc.file)} onClick={onOpen} className={rowClass}>
          {body}
        </Link>
      ) : (
        <a href={doc.url} target="_blank" rel="noopener noreferrer" onClick={onOpen} className={rowClass}>
          {body}
        </a>
      )}
    </li>
  );
}

/** Weekday and time in the display zone, e.g. "Fri 18:00". */
function Published({ at, zone }: { at: string | null; zone: DisplayZone | null }) {
  if (!at) return <span>—</span>;
  if (!zone) return <InlineSkeleton className="h-4 w-20" />;
  return (
    <time key={zone.tz} dateTime={at} className="enter-focus">
      <span className="sr-only">Published </span>
      {formatSessionDay(at, zone.tz).weekday} {formatClock(at, zone.tz)}
    </time>
  );
}
