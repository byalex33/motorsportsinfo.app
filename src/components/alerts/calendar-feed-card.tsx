"use client";

import { CalendarPlusIcon, CheckIcon, CopyIcon } from "lucide-react";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { buttonVariants, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { track } from "@/lib/analytics";
import { calendarFeedLinks, followedSeries, followedSessionTypes, type Follows } from "@/server/alerts/selection";
import { AlertsSection } from "./alerts-section";

const noopSubscribe = () => () => {};

/** "host|protocol" of the current page, null during server render. */
function useOrigin(): { host: string; protocol: "https:" | "http:" } | null {
  const value = useSyncExternalStore(
    noopSubscribe,
    () => `${window.location.host}|${window.location.protocol}`,
    () => null,
  );
  if (!value) return null;
  const [host, protocol] = value.split("|");
  return { host, protocol: protocol === "http:" ? "http:" : "https:" };
}

export function CalendarFeedCard({ follows }: { follows: Follows }) {
  const inputId = useId();
  const origin = useOrigin();
  const links = origin ? calendarFeedLinks(origin.host, origin.protocol, follows) : null;
  const nothingTicked = followedSeries(follows).length === 0;
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function trackCreated() {
    track("calendar_feed_created", { series: followedSeries(follows), session_types: followedSessionTypes(follows) });
  }

  async function copy() {
    if (!links) return;
    try {
      await navigator.clipboard.writeText(links.httpUrl);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: select the text so it can be copied by hand.
      inputRef.current?.select();
    }
    trackCreated();
  }

  return (
    <AlertsSection
      id="calendar-feed-heading"
      index="03"
      title="Calendar feed"
      description="Subscribe to the ticked Sessions in Apple Calendar, Google Calendar, Outlook or any app that takes an iCal link. Times update when the schedule changes — no account needed."
    >
      <div className="grid gap-5">
        {nothingTicked ? (
          <p className="border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground">
            Tick at least one Session Type above to get a calendar link.
          </p>
        ) : (
          <>
            <div className="grid gap-2.5">
              <label htmlFor={inputId} className="eyebrow text-muted-foreground">
                Calendar link
              </label>
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  id={inputId}
                  readOnly
                  value={links?.httpUrl ?? ""}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-9 rounded-md border-border bg-subtle font-mono text-xs md:text-xs dark:bg-subtle"
                />
                <Button variant="outline" size="lg" onClick={copy} disabled={!links} aria-label="Copy calendar link" className="rounded-md">
                  {/* Keyed so each state mounts fresh: the tick pops in and draws itself; the copy icon returns softly. */}
                  {copied ? (
                    <CheckIcon key="icon-copied" aria-hidden className="enter-pop draw-check" />
                  ) : (
                    <CopyIcon key="icon-copy" aria-hidden className="enter-fade" />
                  )}
                  <span key={copied ? "label-copied" : "label-copy"} className="enter-focus max-[380px]:sr-only">
                    {copied ? "Copied" : "Copy"}
                  </span>
                </Button>
              </div>
              <p role="status" aria-live="polite" className="sr-only">
                {copied ? "Calendar link copied" : ""}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              <a
                href={links?.webcalUrl}
                onClick={trackCreated}
                aria-disabled={!links}
                className={buttonVariants({ size: "lg", className: "w-full rounded-md" })}
              >
                <CalendarPlusIcon aria-hidden />
                Add to Apple Calendar
              </a>
              <a
                href={links?.googleUrl}
                onClick={trackCreated}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!links}
                className={buttonVariants({ variant: "outline", size: "lg", className: "w-full rounded-md" })}
              >
                <CalendarPlusIcon aria-hidden />
                Add to Google Calendar
              </a>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Calendar apps check the link for changes on their own schedule — about hourly for Apple Calendar, and up to
              a day for Google Calendar. Cancelled Sessions stay in the feed, marked as cancelled.
            </p>
          </>
        )}
      </div>
    </AlertsSection>
  );
}
