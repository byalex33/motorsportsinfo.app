"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";
import { REPO_URL } from "@/lib/site";
import { useOpenSourceNoteDismissed } from "@/lib/prefs";
import { cn } from "@/lib/utils";

/** The GitHub mark. Lucide dropped brand icons, so it is drawn here at Lucide's 24-unit grid. */
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.6.2 2.9.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  );
}

/**
 * A small note in the bottom-right corner: the site is open source, star it on GitHub. It rises in a
 * moment after load (never during hydration, so it can't flash for a viewer who closed it) and stays
 * closed on this device once dismissed.
 */
export function OpenSourceNote() {
  const dismissed = useOpenSourceNoteDismissed();
  const [closing, setClosing] = useState(false);
  if (!dismissed.ready || dismissed.value) return null;

  return (
    <aside
      aria-label="Open source"
      onAnimationEnd={closing ? () => dismissed.set(true) : undefined}
      className={cn(
        "fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex max-w-[calc(100vw-2rem)] items-center gap-1 rounded-lg border border-border bg-card py-1.5 pr-1.5 pl-3 text-sm text-card-foreground sm:right-6 sm:bottom-6",
        closing
          ? "animate-[dialog-out_160ms_var(--motion-in)_both]"
          : "animate-[dialog-in_560ms_var(--motion-spring)_1200ms_both]",
      )}
    >
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener"
        className="group/oss -my-1 flex min-h-9 items-center gap-2.5 rounded-md pr-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <GitHubMark className="size-4 shrink-0" />
        <span className="leading-tight">
          <span className="block font-medium">We&rsquo;re open source!</span>
          <span className="block text-xs text-muted-foreground transition-colors group-hover/oss:text-primary">
            Star us on GitHub
            <span className="sr-only"> (opens in a new tab)</span>
          </span>
        </span>
      </a>
      <button
        type="button"
        onClick={() => setClosing(true)}
        aria-label="Dismiss"
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <XIcon className="size-3.5" aria-hidden />
      </button>
    </aside>
  );
}
