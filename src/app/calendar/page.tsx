import { Suspense } from "react";
import { CalendarList } from "@/components/calendar/calendar-list";
import { PageTransition } from "@/components/motion/page-transition";
import { RevealWords } from "@/components/motion/reveal-words";
import { PageStamp } from "@/components/service-worker";
import { SERIES } from "@/domain/series";
import { SERIES_IDS } from "@/domain/types";
import { DATA_CREDITS } from "@/lib/data-credits";
import { ENTER, enterDelay } from "@/lib/motion";
import { pageMetadata } from "@/lib/seo/metadata";
import { getCalendarPageData } from "./data";

export const metadata = pageMetadata({
  title: "Calendar – every upcoming Round of F1, F2, F3, WEC, Formula E, IndyCar, MotoGP and more",
  description:
    "Every Round still to come across F1, F2, F3, WEC, Formula E, IndyCar, MotoGP, F1 Academy, WRC, IMSA and NASCAR, with the Circuit and each Session's start in your time zone.",
  path: "/calendar",
});

/** The cards, prerendered from cached data like the Series pages. */
async function Calendar() {
  const { rounds, unavailable, renderedAt } = await getCalendarPageData();
  return (
    <>
      <PageStamp at={renderedAt} />
      <CalendarList rounds={rounds} renderedAt={renderedAt} />
      {unavailable.length > 0 && (
        <p className="mt-8 text-sm text-muted-foreground">
          Schedule coming soon for {unavailable.map((id) => SERIES[id].shortName).join(", ")}.
        </p>
      )}
    </>
  );
}

function CalendarSkeleton() {
  return (
    <div aria-hidden className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-56 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-10 pb-20 sm:px-6 sm:pt-16">
        <p className="eyebrow enter-rise flex items-center gap-2 text-muted-foreground" style={enterDelay(ENTER.eyebrow)}>
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          Calendar
        </p>
        <h1 className="mt-4 max-w-3xl text-[2.25rem] leading-[1.05] font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
          <RevealWords text="Every Round still to come, in your time." />
        </h1>
        <p className="enter-rise mt-5 max-w-2xl leading-relaxed text-pretty text-muted-foreground sm:text-lg" style={enterDelay(ENTER.lead)}>
          F1, F2, F3, WEC, Formula E, IndyCar and MotoGP, plus F1 Academy, WRC, IMSA and NASCAR: each Round that
          hasn&apos;t finished, with its Circuit and every Session&apos;s start in your time zone. Rounds drop off two hours after their final Session.
        </p>
        <div className="enter-rise mt-10 sm:mt-14" style={enterDelay(ENTER.body)}>
          <Suspense fallback={<CalendarSkeleton />}>
            <Calendar />
          </Suspense>
        </div>
        {/* Credits required by the data licences (ADR 0001). */}
        <p className="mt-14 text-center font-mono text-[0.6875rem] tracking-[0.04em] text-muted-foreground">
          Data:{" "}
          {[...new Map(SERIES_IDS.map((id) => [DATA_CREDITS[id].label, DATA_CREDITS[id]])).values()].map((credit, i) => (
            <span key={credit.label}>
              {i > 0 && " · "}
              <a className="transition-colors hover:text-foreground" href={credit.href} target="_blank" rel="noopener noreferrer">
                {credit.label}
              </a>
            </span>
          ))}
        </p>
      </main>
    </PageTransition>
  );
}
