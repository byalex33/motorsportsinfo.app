"use client";

import { useRef, useState } from "react";
import { TrophyIcon } from "lucide-react";
import { deferredLoader, useDeferredModule } from "@/components/deferred-popup";
import type { TimedSession } from "@/domain/types";

export interface SessionResultsDialogProps {
  session: TimedSession;
  /** False when the site has no Session Result (other Series, or OpenF1 has not published it). */
  hasResult: boolean;
  /** The Series' (or Special Event's) official results page. */
  resultsUrl: string;
}

// The Dialog loads after the page is interactive (deferred-popup.ts). The chip stays this same button
// throughout, so its entrance animation plays once; a click before the Dialog arrives opens it when it does.
const loadModal = deferredLoader(() => import("./session-results-modal"));

/**
 * The green RESULTS chip beside FINISHED. Results are spoilers, so they stay out of the Session list and out
 * of the page itself: the chip opens a modal that warns first, and the Session Result is fetched only when asked.
 */
export function SessionResultsDialog(props: SessionResultsDialogProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [modal, load] = useDeferredModule(loadModal);

  return (
    <>
      {/* The button is a 24 px tap target (WCAG 2.5.8) that takes no more room than the chip inside, which keeps its look. */}
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-popup-open={open ? "" : undefined}
        onPointerEnter={load}
        onFocus={load}
        onClick={() => {
          setOpen(true);
          load();
        }}
        className="group -my-0.5 inline-flex min-h-6 cursor-pointer items-center outline-none"
      >
        <span className="chip results-chip border border-success/50 bg-success/10 text-success transition-colors group-hover:border-success group-hover:bg-success/20 group-focus-visible:ring-2 group-focus-visible:ring-success/60 group-data-popup-open:bg-success/20">
          <TrophyIcon className="size-3" aria-hidden />
          Results
          <span className="sr-only"> for {props.session.name} (contains spoilers)</span>
        </span>
      </button>
      {modal && <modal.SessionResultsModal {...props} open={open} onOpenChange={setOpen} trigger={trigger} />}
    </>
  );
}
