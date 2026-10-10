"use client";

import Link from "next/link";
import { ActivityIcon, ArrowUpRightIcon, EyeIcon, EyeOffIcon, TrophyIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Session, SessionResult } from "@/domain/types";
import { staggerDelay } from "@/lib/motion";
import { sessionSlug } from "@/lib/session-slug";
import { useSpoilerRevealed } from "@/lib/spoilers";
import { cn } from "@/lib/utils";

interface SessionResultsDialogProps {
  session: Session;
  /** Missing when the site has no Session Result (other Series, or OpenF1 has not published it). */
  result: SessionResult | undefined;
  /** The Series' official results page. */
  resultsUrl: string;
}

/**
 * The green RESULTS chip beside FINISHED. Results are spoilers, so they stay out of the Session list:
 * the chip opens a modal that warns first and shows the Session Result only when asked.
 */
export function SessionResultsDialog({ session, result, resultsUrl }: SessionResultsDialogProps) {
  // Once revealed (here or on the Telemetry page), reopening the modal shows the results straight away.
  const [revealed, reveal] = useSpoilerRevealed(session.id);
  const site = new URL(resultsUrl).hostname.replace(/^www\./, "");
  const telemetryHref = session.series === "f1" && result ? `/${session.series}/telemetry/${sessionSlug(session)}` : null;

  return (
    <Dialog>
      <DialogTrigger
        className="chip results-chip cursor-pointer border border-success/50 bg-success/10 text-success outline-none transition-colors hover:border-success hover:bg-success/20 focus-visible:ring-2 focus-visible:ring-success/60 data-popup-open:bg-success/20"
      >
        <TrophyIcon className="size-3" aria-hidden />
        Results
        <span className="sr-only"> for {session.name} (contains spoilers)</span>
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
              {result
                ? "This shows who finished where. Haven't watched it yet? Close this now."
                : `The full classification is on ${site}, which shows who finished where.`}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {result && (revealed ? <ResultTable result={result} /> : <HiddenResults onReveal={reveal} />)}
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
            className={buttonVariants({ variant: result ? "ghost" : "outline", className: "justify-center sm:flex-1" })}
          >
            {result ? `Full results on ${site}` : `See results on ${site}`}
            <ArrowUpRightIcon aria-hidden />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ROW = "grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4";

/** Stand-in rows under a blur, so nothing real can be read before the reveal. */
function HiddenResults({ onReveal }: { onReveal: () => void }) {
  return (
    <div className="relative">
      <ol aria-hidden className="divide-y divide-border blur-[3px] select-none">
        {[1, 2, 3, 4, 5].map((position) => (
          <li key={position} className={cn(ROW, "py-3")}>
            <span className="font-mono text-sm text-muted-foreground tabular">{position}</span>
            <span className="h-3 w-28 rounded-sm bg-muted-foreground/30" />
            <span className="h-3 w-16 rounded-sm bg-muted-foreground/20" />
          </li>
        ))}
      </ol>
      <div className="absolute inset-0 grid place-items-center bg-background/40">
        <Button onClick={onReveal} className="bg-success text-background hover:bg-success/85">
          <EyeIcon aria-hidden />
          Show results
        </Button>
      </div>
    </div>
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
