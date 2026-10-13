import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageTransition } from "@/components/motion/page-transition";
import { RoundCountdown } from "@/components/round/round-countdown";
import { SpecialEventHero } from "@/components/round/round-hero";
import { RoundSessions } from "@/components/round/round-sessions";
import { PageStamp } from "@/components/service-worker";
import { pageMetadata } from "@/lib/seo/metadata";
import { formatRoundDates } from "@/lib/time-format";
import { trackTimeTexts } from "@/lib/track-time";
import { listSpecialEvents } from "@/server/schedule";
import { getSpecialEventPageData } from "./data";

// Static like the Series pages: prerendered per Special Event with ~5 minute cached data (the forecasts).
// See src/app/[series]/page.tsx for ensureStatic and instant.
export const ensureStatic = "navigation";
export const instant = false;

export async function generateStaticParams() {
  return listSpecialEvents().map((event) => ({ slug: event.slug }));
}

export async function generateMetadata({ params }: PageProps<"/special/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getSpecialEventPageData(slug);
  if (!data) return {};
  const { event } = data;
  return pageMetadata({
    title: `${event.name} – session times & weather`,
    description: `${event.championship}, ${formatRoundDates(event.startDate, event.endDate)} at ${event.circuit.name}: every Session in your time zone or Track Time, with countdown and weather.`,
    path: `/special/${event.slug}`,
  });
}

export default async function SpecialEventPage({ params }: PageProps<"/special/[slug]">) {
  const { slug } = await params;
  const data = await getSpecialEventPageData(slug);
  if (!data) notFound();

  const { event, forecasts, renderedAt } = data;
  const trackTimes = trackTimeTexts(event.sessions, event.circuit.timeZone);

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-14 px-4 pt-10 pb-20 sm:space-y-16 sm:px-6 sm:pt-16">
        <PageStamp at={renderedAt} />
        <SpecialEventHero
          event={event}
          countdown={
            <RoundCountdown
              sessions={event.sessions}
              circuitTimeZone={event.circuit.timeZone}
              trackTimes={trackTimes}
              renderedAt={renderedAt}
              finishedNote="Thanks for following along."
            />
          }
        />
        <RoundSessions
          credit={event.source}
          sessions={event.sessions}
          forecasts={forecasts}
          results={[]}
          resultsUrl={event.source.href}
          timesConfirmed
          circuitTimeZone={event.circuit.timeZone}
          trackTimes={trackTimes}
        />
      </main>
    </PageTransition>
  );
}
