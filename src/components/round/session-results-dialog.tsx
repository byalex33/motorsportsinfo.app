"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { ActivityIcon, ArrowUpRightIcon, EyeIcon, EyeOffIcon, RotateCcwIcon, TrophyIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { SessionResult, TimedSession } from "@/domain/types";
import { staggerDelay } from "@/lib/motion";
import { sessionSlug } from "@/lib/session-slug";
import { useSpoilerRevealed } from "@/lib/spoilers";
import { cn } from "@/lib/utils";

interface SessionResultsDialogProps {
  session: TimedSession;
  /** False when the site has no Session Result (other Series, or OpenF1 has not published it). */
  hasResult: boolean;
  /** The Series' (or Special Event's) official results page. */
  resultsUrl: string;
}

/**
 * The green RESULTS chip beside FINISHED. Results are spoilers, so they stay out of the Session list and out
 * of the page itself: the chip opens a modal that warns first, and the Session Result is fetched only when asked.
 */
export function SessionResultsDialog({ session, hasResult, resultsUrl }: SessionResultsDialogProps) {
  // Once revealed (here or on the Telemetry page), reopening the modal shows the results straight away.
  const [revealed, reveal] = useSpoilerRevealed(session.id);
  const site = new URL(resultsUrl).hostname.replace(/^www\./, "");
  const slug = sessionSlug(session);
  const telemetryHref = session.series === "f1" && hasResult ? `/${session.series}/telemetry/${slug}` : null;

  return (
    <Dialog>
      {/* The button is a 24 px tap target (WCAG 2.5.8) that takes no more room than the chip inside, which keeps its look. */}
      <DialogTrigger className="group -my-0.5 inline-flex min-h-6 cursor-pointer items-center outline-none">
        <span className="chip results-chip border border-success/50 bg-success/10 text-success transition-colors group-hover:border-success group-hover:bg-success/20 group-focus-visible:ring-2 group-focus-visible:ring-success/60 group-data-popup-open:bg-success/20">
          <TrophyIcon className="size-3" aria-hidden />
          Results
          <span className="sr-only"> for {session.name} (contains spoilers)</span>
        </span>
      </DialogTrigger>

      {/* Header and footer stay put; the classification scrolls between them on small screens. */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border p-4 pr-12">
          <p className="eyebrow text-success">Results</p>
          <DialogTitle className="text-lg tracking-tight">{session.name}</DialogTitle>
          <DialogDescription className="flex items-start gap-2">
            <EyeOffIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <span className="font-medium text-foreground">Spoiler warning.</span>{" "}
              {hasResult
                ? "This shows who finished where. Haven't watched it yet? Close this now."
                : `The full classification is on ${site}, which shows who finished where.`}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {hasResult &&
            (revealed ? <LoadedResults path={`/api/results/${session.series}/${slug}`} site={site} /> : <HiddenResults onReveal={reveal} />)}
        </div>

        <div className="flex flex-col gap-2 border-t border-border p-3 sm:flex-row">
          {telemetryHref && revealed && (
            <Link
              href={telemetryHref}
              className={buttonVariants({ variant: "outline", className: "justify-center sm:flex-1" })}
            >
              <ActivityIcon aria-hidden />
              Compare telemetry
            </Link>
          )}
          <a
            href={resultsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: hasResult ? "ghost" : "outline", className: "justify-center sm:flex-1" })}
          >
            {hasResult ? `Full results on ${site}` : `See results on ${site}`}
            <ArrowUpRightIcon aria-hidden />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ROW = "grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4";

/** Stand-in rows: blurred before the reveal, pulsing while the Session Result loads. */
function PlaceholderRows({ className }: { className?: string }) {
  return (
    <ol aria-hidden className={cn("divide-y divide-border select-none", className)}>
      {[1, 2, 3, 4, 5].map((position) => (
        <li key={position} className={cn(ROW, "py-3")}>
          <span className="font-mono text-sm text-muted-foreground tabular">{position}</span>
          <span className="h-3 w-28 rounded-sm bg-muted-foreground/30" />
          <span className="h-3 w-16 rounded-sm bg-muted-foreground/20" />
        </li>
      ))}
    </ol>
  );
}

/** Stand-in rows under a blur. Nothing real is on the page yet: it is fetched after the reveal. */
function HiddenResults({ onReveal }: { onReveal: () => void }) {
  return (
    <div className="relative">
      <PlaceholderRows className="blur-[3px]" />
      <div className="absolute inset-0 grid place-items-center bg-background/40">
        <Button onClick={onReveal} className="bg-success text-background hover:bg-success/85">
          <EyeIcon aria-hidden />
          Show results
        </Button>
      </div>
    </div>
  );
}

/** The Session Result, fetched once per page view from /api/results/…, with loading and failed states. */
function LoadedResults({ path, site }: { path: string; site: string }) {
  const load = useResultLoad(path);
  useEffect(() => requestResult(path), [path]);

  if (load.status === "ready") return <ResultTable result={load.result} />;
  if (load.status === "failed") {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">Couldn&apos;t load the results. Try again, or see them on {site}.</p>
        <Button variant="outline" size="sm" onClick={() => requestResult(path, true)}>
          <RotateCcwIcon aria-hidden />
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Loading results
      </p>
      <PlaceholderRows className="animate-pulse" />
    </div>
  );
}

// Session Results fetched in this page view, by path, so reopening the modal shows them without a refetch.
type ResultLoad = { status: "loading" } | { status: "ready"; result: SessionResult } | { status: "failed" };
const LOADING: ResultLoad = { status: "loading" };
const resultLoads = new Map<string, ResultLoad>();
const resultListeners = new Set<() => void>();

function setResultLoad(path: string, load: ResultLoad) {
  resultLoads.set(path, load);
  for (const l of resultListeners) l();
}

/** Fetch a Session Result unless it is loaded or loading already; `retry` fetches again after a failure. */
function requestResult(path: string, retry = false) {
  const current = resultLoads.get(path);
  if (current && !(retry && current.status === "failed")) return;
  setResultLoad(path, LOADING);
  fetch(path)
    .then((res) => (res.ok ? (res.json() as Promise<SessionResult>) : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then(
      (result) => setResultLoad(path, { status: "ready", result }),
      () => setResultLoad(path, { status: "failed" }),
    );
}

function subscribeResults(cb: () => void) {
  resultListeners.add(cb);
  return () => resultListeners.delete(cb);
}

function useResultLoad(path: string): ResultLoad {
  return useSyncExternalStore(
    subscribeResults,
    () => resultLoads.get(path) ?? LOADING,
    () => LOADING,
  );
}

function ResultTable({ result }: { result: SessionResult }) {
  return (
    <div>
      <div aria-hidden className={cn(ROW, "eyebrow sticky top-0 z-10 border-b border-border bg-background py-2 text-muted-foreground")}>
        <span>Pos</span>
        <span>Driver</span>
        <span className="text-right">Time</span>
      </div>
      <ol aria-label="Classification" className="divide-y divide-border">
        {result.entries.map((entry, index) => {
          const status = entry.time === "DNF" || entry.time === "DNS" || entry.time === "DSQ";
          return (
            <li key={`${entry.position ?? "nc"}-${entry.name}`} className={cn(ROW, "enter-rise py-2.5")} style={staggerDelay(index, 0, 25, 12)}>
              <span className={cn("font-mono text-sm tabular", entry.position === 1 ? "font-semibold text-success" : "text-muted-foreground")}>
                {entry.position ?? (
                  <>
                    <span aria-hidden>—</span>
                    <span className="sr-only">Not classified</span>
                  </>
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium tracking-tight">{entry.name}</span>
                {entry.team && <span className="block truncate text-xs text-muted-foreground">{entry.team}</span>}
              </span>
              <span className={cn("text-right font-mono text-xs tabular", status ? "text-muted-foreground" : "text-foreground")}>
                {entry.time ?? "—"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
