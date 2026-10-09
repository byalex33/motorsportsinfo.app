import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { SERIES } from "@/domain/series";
import { SERIES_IDS } from "@/domain/types";
import { PageTransition } from "@/components/motion/page-transition";
import { RevealWords } from "@/components/motion/reveal-words";
import { ENTER, enterDelay, staggerDelay } from "@/lib/motion";

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
        <ul className="mt-12 max-w-xl divide-y divide-border border-y border-border">
          {SERIES_IDS.map((id, i) => (
            <li key={id} data-series={id} className="enter-rise" style={staggerDelay(i, ENTER.body, 40)}>
              <Link
                href={`/${id}`}
                className="group flex items-center gap-3 px-1 py-3.5 transition-colors outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-3"
              >
                <span aria-hidden className="size-1.5 rounded-full bg-series-gradient" />
                <span className="w-16 shrink-0 font-medium">{SERIES[id].shortName}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{SERIES[id].name}</span>
                <ArrowRightIcon
                  className="size-4 text-muted-foreground transition-[color,translate] duration-300 ease-spring group-hover:translate-x-1 group-hover:text-foreground"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </PageTransition>
  );
}
