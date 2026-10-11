"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import { SpoilerTitle } from "@/components/documents/spoiler";
import { InlineSkeleton } from "@/components/inline-skeleton";
import { SegmentPill } from "@/components/motion/segment-pill";
import type { FiaDocumentKind, SeriesId } from "@/domain/types";
import { track } from "@/lib/analytics";
import { useNow } from "@/lib/client-stores";
import type { DisplayZone } from "@/lib/display-zone";
import { ENTER, enterDelay, staggerDelay } from "@/lib/motion";
import { formatClock, formatSessionDay, zoneOffsetLabel } from "@/lib/time-format";
import { cn } from "@/lib/utils";
import { SegmentButton, segmentTrack } from "./display-controls";
import { useDisplayZone } from "./use-display-zone";

/** One FIA Document as the list shows it: just what a row renders (see RoundDocuments). */
export interface DocumentListRow {
  number: number | null;
  title: string;
  kind: FiaDocumentKind;
  /** ISO 8601 UTC, or null. */
  publishedAt: string | null;
  /** Our viewer page (a path), or the PDF on fia.com (an absolute URL) for a document outside the FIA's folder. */
  href: string;
}

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

export function RoundDocumentList({ series, rows, circuitTimeZone }: { series: SeriesId; rows: DocumentListRow[]; circuitTimeZone: string }) {
  const zone = useDisplayZone(circuitTimeZone);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState(false);
  const now = useNow(60_000);

  const counts: Record<Filter, number> = { all: rows.length, stewards: 0, results: 0, other: 0 };
  for (const d of rows) counts[d.kind]++;
  // Only offer filters that would leave something, and only when there is more than one kind.
  const filters = FILTERS.filter((f) => counts[f.id] > 0);
  const shown = filter === "all" ? rows : rows.filter((d) => d.kind === filter);
  const visible = expanded ? shown : shown.slice(0, INITIAL_ROWS);
  // The zone's offset, as the Session list's TIME header shows it, at the newest document.
  const newest = rows.find((d) => d.publishedAt)?.publishedAt;
  const offset = zone && newest ? zoneOffsetLabel(zone.tz, new Date(newest)) : null;

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
          <span>Published{offset ? ` · ${offset}` : ""}</span>
          <span className="pr-3" />
        </li>
        {visible.map((doc, index) => (
          <DocumentRow
            key={doc.href}
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
  doc: DocumentListRow;
  index: number;
  zone: DisplayZone | null;
  isNew: boolean;
}) {
  const onOpen = () => track("fia_document_opened", { series, kind: doc.kind });
  const inViewer = doc.href.startsWith("/");
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
          <span className="font-medium tracking-tight text-pretty">
            <SpoilerTitle title={doc.title} />
          </span>
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
        {inViewer ? (
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
      {inViewer ? (
        <Link href={doc.href} onClick={onOpen} className={rowClass}>
          {body}
        </Link>
      ) : (
        <a href={doc.href} target="_blank" rel="noopener noreferrer" onClick={onOpen} className={rowClass}>
          {body}
        </a>
      )}
    </li>
  );
}

/** Weekday and time in the display zone, e.g. "Fri 18:00" (and its offset, for screen readers). */
function Published({ at, zone }: { at: string | null; zone: DisplayZone | null }) {
  if (!at) return <span>—</span>;
  if (!zone) return <InlineSkeleton className="h-4 w-20" />;
  return (
    <time key={zone.tz} dateTime={at} className="enter-focus">
      <span className="sr-only">Published </span>
      {formatSessionDay(at, zone.tz).weekday} {formatClock(at, zone.tz)}
      <span className="sr-only"> {zoneOffsetLabel(zone.tz, new Date(at))}</span>
    </time>
  );
}
