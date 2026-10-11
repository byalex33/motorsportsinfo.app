import type { Metadata } from "next";
import { PageTransition } from "@/components/motion/page-transition";
import { RevealWords } from "@/components/motion/reveal-words";
import { SeriesLinkList } from "@/components/series-link-list";
import { ENTER, enterDelay } from "@/lib/motion";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-14 pb-20 sm:px-6 sm:pt-24">
        <p className="eyebrow enter-rise flex items-center gap-2 text-muted-foreground" style={enterDelay(ENTER.eyebrow)}>
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          404
        </p>
        <h1 className="mt-4 text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.045em] sm:text-6xl">
          <RevealWords text="Off the racing line" />
        </h1>
        <p className="enter-rise mt-5 max-w-xl leading-relaxed text-muted-foreground sm:text-lg" style={enterDelay(ENTER.lead)}>
          That page doesn&apos;t exist. Pick a Series to get back on track.
        </p>
        <div className="mt-12">
          <SeriesLinkList />
        </div>
      </main>
    </PageTransition>
  );
}
