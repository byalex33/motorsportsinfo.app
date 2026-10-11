"use client";

import { ArrowRightIcon, RotateCwIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { RevealWords } from "@/components/motion/reveal-words";
import { SeriesLinkList } from "@/components/series-link-list";
import { CONTACT_EMAIL } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { ENTER, enterDelay } from "@/lib/motion";

/**
 * The error page body shared by app/error.tsx and app/global-error.tsx: say what happened, offer a
 * retry, and the ways back on track (every Series, and the calendar feed, which keeps working when
 * a page doesn't).
 */
export function RedFlag({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-14 pb-20 sm:px-6 sm:pt-24">
      <p className="eyebrow enter-rise flex items-center gap-2 text-muted-foreground" style={enterDelay(ENTER.eyebrow)}>
        <span aria-hidden className="size-1.5 rounded-full bg-destructive" />
        Error
      </p>
      <h1 className="mt-4 text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.045em] sm:text-6xl">
        <RevealWords text="Red flag" />
      </h1>
      <p className="enter-rise mt-5 max-w-xl leading-relaxed text-pretty text-muted-foreground sm:text-lg" style={enterDelay(ENTER.lead)}>
        Something went wrong loading this page. Try again, or pick a Series to get back on track.
      </p>
      <div className="enter-rise mt-8 flex flex-wrap items-center gap-x-5 gap-y-3" style={enterDelay(ENTER.lead + 30)}>
        <Button size="lg" className="px-3.5" onClick={() => retry()}>
          <RotateCwIcon aria-hidden data-icon="inline-start" />
          Try again
        </Button>
        <Link
          href="/alerts"
          className="group inline-flex min-h-6 items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Alerts &amp; calendar feed
          <ArrowRightIcon aria-hidden className="size-4 transition-transform duration-300 ease-spring group-hover:translate-x-0.5" />
        </Link>
      </div>
      <div className="mt-12">
        <SeriesLinkList />
      </div>
      <p className="mt-8 max-w-xl text-xs leading-relaxed text-muted-foreground">
        If it keeps happening, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4 hover:text-foreground">
          {CONTACT_EMAIL}
        </a>
        {error.digest && (
          <>
            {" "}
            and quote <span className="font-mono">{error.digest}</span>
          </>
        )}
        .
      </p>
    </main>
  );
}
