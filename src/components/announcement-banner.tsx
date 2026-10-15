"use client";

import { ArrowRightIcon, SparklesIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useNow } from "@/lib/client-stores";
import { useDismissedAnnouncement } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import type { SpecialEventAnnouncement } from "@/server/schedule";

/**
 * A strip under the header announcing a Special Event, linking to its page. It shows the soonest one that has
 * not finished, opens a moment after load (never during hydration, so it can't flash for a viewer who closed
 * it), stays closed on this device once dismissed, hides itself on the event's own page and goes away for
 * everyone 2 hours after the event's final Session. It takes the event's accent, like its page.
 */
export function AnnouncementBanner({ announcements }: { announcements: SpecialEventAnnouncement[] }) {
  const now = useNow(60_000);
  const dismissed = useDismissedAnnouncement();
  const pathname = usePathname();
  // The id being closed, not a flag: the banner stays mounted across navigations, so a later Special Event must
  // not inherit the previous one's exit animation (and be stored as dismissed when it ends).
  const [closingId, setClosingId] = useState<string | null>(null);

  const current = now === null ? undefined : announcements.find((a) => Date.parse(a.until) > now);
  if (!current || !dismissed.ready || dismissed.value === current.id || pathname === current.href) return null;
  const closing = closingId === current.id;

  return (
    <div
      onAnimationEnd={closing ? () => dismissed.set(current.id) : undefined}
      className={cn(
        "grid grid-rows-[1fr]",
        closing ? "animate-[announce-out_220ms_var(--motion-in)_both]" : "animate-[announce-in_520ms_var(--motion-out)_600ms_both]",
      )}
    >
      <aside
        aria-label="Announcement"
        data-accent={current.accent ?? undefined}
        className="min-h-0 overflow-hidden border-b border-series-accent/20 bg-series-accent/[0.07]"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-2 py-1.5 pr-2.5 pl-4 sm:pr-4 sm:pl-6">
          <Link
            href={current.href}
            prefetch
            className="group/announce -my-1 flex min-h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="chip shrink-0 bg-series-accent text-series-accent-foreground">
              <SparklesIcon className="size-3" aria-hidden />
              Special
            </span>
            <span className="min-w-0 leading-snug text-pretty">
              <span className="font-medium">{current.text}.</span>{" "}
              <span className="whitespace-nowrap text-series-accent underline-offset-4 group-hover/announce:underline">
                Session times &amp; weather
                <ArrowRightIcon className="ml-1 inline size-3.5 align-[-0.15em] transition-transform group-hover/announce:translate-x-0.5" aria-hidden />
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setClosingId(current.id)}
            aria-label="Dismiss announcement"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-series-accent/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon className="size-3.5" aria-hidden />
          </button>
        </div>
      </aside>
    </div>
  );
}
