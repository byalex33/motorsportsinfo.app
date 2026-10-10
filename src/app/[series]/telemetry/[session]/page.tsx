import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { PageTransition } from "@/components/motion/page-transition";
import { ComparisonColors } from "@/components/telemetry/comparison-colors";
import { DriverPicker } from "@/components/telemetry/driver-picker";
import { LapTimesChart } from "@/components/telemetry/lap-times-chart";
import { LapTraces } from "@/components/telemetry/lap-traces";
import { SectorTable } from "@/components/telemetry/sector-table";
import { ShareComparison } from "@/components/telemetry/share-comparison";
import { SpoilerGate } from "@/components/telemetry/spoiler-gate";
import { formatLapTime } from "@/lib/lap-time";
import { ENTER, enterDelay } from "@/lib/motion";
import { colorParam } from "@/lib/team-colors";
import { channelParam } from "@/lib/telemetry-channels";
import { findTelemetrySession, resolveTelemetry } from "./comparison";

// Telemetry for one finished F1 Session of the Featured Round: two drivers' fastest laps compared, chosen
// in the query (?a=VER&b=RUS, colours ?ca=…&cb=…, channel ?ch=…). It depends on the query, so it renders at request time
// from cached data, and instant = false lets navigations wait for that render, as on the FIA Document pages.
export const instant = false;

export async function generateMetadata({ params, searchParams }: PageProps<"/[series]/telemetry/[session]">): Promise<Metadata> {
  const { series, session: slug } = await params;
  const found = await findTelemetrySession(series, slug);
  // A comparison of the Featured Round only; it moves on with the Round, so search engines shouldn't keep it.
  const robots = { index: false, follow: true };
  if (!found) return { robots };

  // The preview card (X, messages) is the share image for exactly this comparison.
  const query = await searchParams;
  const card = new URLSearchParams();
  for (const key of ["a", "b"] as const) if (typeof query[key] === "string" && /^[a-z]{3}$/i.test(query[key])) card.set(key, query[key]);
  for (const key of ["ca", "cb"] as const) {
    const color = colorParam(query[key]);
    if (color) card.set(key, color.slice(1));
  }
  const channel = channelParam(query.ch);
  if (channel !== "speed") card.set("ch", channel);
  const image = { url: `/f1/telemetry/${slug}/image${card.size ? `?${card}` : ""}`, width: 1200, height: 675, alt: `${found.session.name} telemetry comparison` };
  const title = `F1 ${found.round.name} ${found.session.name} telemetry`;
  const description = `Compare two drivers' fastest laps in ${found.session.name}: speed, throttle, brake, gear and the gap, mini-sector by mini-sector.`;
  return {
    title,
    description,
    robots,
    openGraph: { title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function TelemetryPage({ params, searchParams }: PageProps<"/[series]/telemetry/[session]">) {
  return (
    <PageTransition>
      <main data-series="f1" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-20 sm:px-6 sm:pt-12">
        <Suspense fallback={<TelemetrySkeleton />}>
          <TelemetryView params={params} searchParams={searchParams} />
        </Suspense>
      </main>
    </PageTransition>
  );
}

async function TelemetryView({ params, searchParams }: PageProps<"/[series]/telemetry/[session]">) {
  const { series, session: slug } = await params;
  const view = await resolveTelemetry(series, slug, await searchParams);
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

  const { drivers, a, b, lapsA, lapsB, lapA, lapB, comparison, offPace, picks, channel } = view;
  return (
    <Shell header={header}>
      <SpoilerGate sessionId={session.id}>
        {/* Keyed on the pair, so new drivers start from their team colours. */}
        <ComparisonColors key={`${a.code}-${b.code}`} teamA={a.color} teamB={b.color} initialPicks={picks} className="space-y-12">
          <div className="space-y-3">
            <DriverPicker path={`/f1/telemetry/${view.slug}`} drivers={drivers} a={a.code} b={b.code} />
            <p className="text-sm text-muted-foreground">
              Fastest laps: <span className="text-foreground">{a.code}</span> lap {lapA.lap} ({formatLapTime(lapA.time!)}) against{" "}
              <span className="text-foreground">{b.code}</span> lap {lapB.lap} ({formatLapTime(lapB.time!)}).
            </p>
            {offPace.map(({ driver, lap }) => (
              <p key={driver.number} className="border-l-2 border-series-accent pl-3 text-sm text-muted-foreground">
                {driver.code}&apos;s quickest timed lap ({formatLapTime(lap.time!)}) is well off the pace, so it wasn&apos;t a clean flying
                lap: expect big gaps.
              </p>
            ))}
            {comparison && (
              <ShareComparison
                imagePath={`/f1/telemetry/${view.slug}/image`}
                text={`${a.code} vs ${b.code} · F1 ${round.name} ${session.name} telemetry`}
                fileName={`${round.slug}-${view.slug}-${a.code}-${b.code}`.toLowerCase()}
              />
            )}
          </div>

          {comparison ? (
            <LapTraces comparison={comparison} a={a} b={b} initialChannel={channel} />
          ) : (
            <Notice>OpenF1 doesn&apos;t have the car data for these laps yet, so only the timing is shown.</Notice>
          )}

          <section aria-labelledby="sectors-heading" className="space-y-3">
            <h2 id="sectors-heading" className="eyebrow text-muted-foreground">
              Sectors and speed traps
            </h2>
            <SectorTable a={a} b={b} lapA={lapA} lapB={lapB} />
          </section>

          <LapTimesChart a={a} b={b} lapsA={lapsA} lapsB={lapsB} comparedA={lapA.lap} comparedB={lapB.lap} />
        </ComparisonColors>
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
