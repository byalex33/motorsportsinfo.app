import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { PageTransition } from "@/components/motion/page-transition";
import { SpoilerGate } from "@/components/telemetry/spoiler-gate";
import { TelemetryComparison } from "@/components/telemetry/telemetry-comparison";
import { ENTER, enterDelay } from "@/lib/motion";
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/seo/og-image";
import { comparisonCardQuery } from "./card";
import { findTelemetrySession, telemetryStatus } from "./comparison";

// Telemetry for one finished F1 Session of the Featured Round: two drivers' fastest laps compared, chosen
// in the query (?a=VER&b=RUS, colours ?ca=…&cb=…, channel ?ch=…). The comparison is a spoiler, so the page
// itself carries only the spoiler warning; TelemetryComparison fetches the comparison (./data) on reveal.
// The page reads the clock (has the Session finished?) and its card reads the query, so it renders at request
// time from cached data, and instant = false lets navigations wait for that render, as on the FIA Document pages.
// Unknown slugs are turned away with a real 404 by src/proxy.ts, before this streams.
export const instant = false;

export async function generateMetadata({ params, searchParams }: PageProps<"/[series]/telemetry/[session]">): Promise<Metadata> {
  const { series, session: slug } = await params;
  const found = await findTelemetrySession(series, slug);
  // A comparison of the Featured Round only; it moves on with the Round, so search engines shouldn't keep it.
  const robots = { index: false, follow: true };
  if (!found) return { robots };
  const title = `F1 ${found.round.name} ${found.session.name} telemetry`;

  // A bare link's card is the F1 page's, which shows no result; one that names both drivers gets the comparison.
  const card = comparisonCardQuery(await searchParams);
  if (!card) {
    const description = `Compare two drivers' fastest laps in ${found.session.name}: speed, throttle, brake, gear and the gap. Spoiler-safe: nothing shows until you choose to see it.`;
    const image = { url: "/f1/opengraph-image", ...OG_SIZE, type: OG_CONTENT_TYPE, alt: `F1 ${found.round.name}` };
    return {
      title,
      description,
      robots,
      openGraph: { title, description, images: [image] },
      twitter: { card: "summary_large_image", title, description, images: [image] },
    };
  }

  const image = { url: `/f1/telemetry/${slug}/image?${card}`, width: 1200, height: 675, alt: `${found.session.name} telemetry comparison` };
  const description = `Compare two drivers' fastest laps in ${found.session.name}: speed, throttle, brake, gear and the gap, mini-sector by mini-sector.`;
  return {
    title,
    description,
    robots,
    openGraph: { title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function TelemetryPage({ params }: PageProps<"/[series]/telemetry/[session]">) {
  return (
    <PageTransition>
      <main data-series="f1" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-20 sm:px-6 sm:pt-12">
        <Suspense fallback={<TelemetrySkeleton />}>
          <TelemetryView params={params} />
        </Suspense>
      </main>
    </PageTransition>
  );
}

async function TelemetryView({ params }: Pick<PageProps<"/[series]/telemetry/[session]">, "params">) {
  const { series, session: slug } = await params;
  const view = await telemetryStatus(series, slug);
  if (view.kind === "not-found") notFound();
  const { round, session } = view;

  const header = (
    <header className="space-y-3">
      <Link
        href="/f1"
        className="enter-rise -ml-0.5 inline-flex items-center gap-2 rounded-full py-1 pr-3 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        style={enterDelay(ENTER.eyebrow)}
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        F1 {round.name}
      </Link>
      <p className="eyebrow enter-rise flex items-center gap-2 pt-3 text-muted-foreground" style={enterDelay(ENTER.eyebrow + 30)}>
        <span aria-hidden className="size-1.5 rounded-full bg-series-gradient" />
        Telemetry
      </p>
      <h1 className="enter-rise text-3xl leading-tight font-semibold tracking-[-0.035em] sm:text-4xl" style={enterDelay(ENTER.title)}>
        {session.name}
      </h1>
    </header>
  );

  if (view.kind === "not-finished") {
    return (
      <Shell header={header}>
        <Notice>Telemetry appears here once {session.name} has finished.</Notice>
      </Shell>
    );
  }
  if (view.kind === "unavailable") {
    return (
      <Shell header={header}>
        <Notice>
          Telemetry for {session.name} isn&apos;t available right now. OpenF1 publishes the laps within about half an hour of the
          chequered flag; if it&apos;s been longer, try again in a few minutes.
        </Notice>
      </Shell>
    );
  }
  if (view.kind === "too-few") {
    return (
      <Shell header={header}>
        <Notice>Fewer than two drivers set a timed lap in {session.name}, so there is nothing to compare.</Notice>
      </Shell>
    );
  }

  return (
    <Shell header={header}>
      <SpoilerGate sessionId={session.id}>
        <TelemetryComparison path={`/f1/telemetry/${view.slug}`} roundName={round.name} roundSlug={round.slug} sessionName={session.name} />
      </SpoilerGate>
    </Shell>
  );
}

function Shell({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <>
      {header}
      <div className="enter-rise mt-8" style={enterDelay(ENTER.body)}>
        {children}
      </div>
      {/* Credit required by OpenF1's licence (ADR 0001). */}
      <p className="enter-fade mt-14 text-center font-mono text-[0.6875rem] tracking-[0.04em] text-muted-foreground" style={enterDelay(ENTER.rows + 160)}>
        <a className="transition-colors hover:text-foreground" href="https://openf1.org" target="_blank" rel="noopener noreferrer">
          Data: OpenF1
        </a>
      </p>
    </>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-border px-5 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

function TelemetrySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading telemetry">
      <div className="h-6 w-48 animate-pulse rounded-md bg-muted" />
      <div className="mt-6 space-y-3">
        <div className="h-4 w-24 animate-pulse rounded-md bg-muted" />
        <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="mt-8 h-96 w-full animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
