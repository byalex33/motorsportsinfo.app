import { CalendarIcon, FlagIcon, MapPinIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SERIES } from "@/domain/series";
import type { Circuit, Round, SeriesId } from "@/domain/types";
import { formatRoundDates } from "@/lib/time-format";

function HeroShell({ series, children }: { series: SeriesId; children: ReactNode }) {
  return (
    <section className="relative isolate overflow-hidden rounded-3xl border border-border bg-card shadow-lg">
      {/* Accent glow, chequer band and a watermark of the Series short name — decoration only. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -right-24 size-[28rem] rounded-full bg-series-accent/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 size-[22rem] rounded-full bg-primary/10 blur-3xl" />
        <div className="bg-chequer absolute inset-y-0 right-0 w-1/3 text-foreground opacity-[0.035] [mask-image:linear-gradient(to_left,black,transparent)]" />
        <span className="absolute -right-3 -bottom-10 text-[9rem] leading-none font-extrabold tracking-tighter text-foreground/[0.04] select-none sm:text-[14rem]">
          {SERIES[series].shortName}
        </span>
        <div className="absolute inset-x-0 top-0 h-1 bg-series-accent" />
      </div>
      {children}
    </section>
  );
}

export function RoundHero({
  series,
  round,
  circuit,
  countdown,
}: {
  series: SeriesId;
  round: Round;
  circuit: Circuit;
  countdown: ReactNode;
}) {
  const info = SERIES[series];
  return (
    <HeroShell series={series}>
      <div className="grid gap-8 p-5 pt-7 sm:p-8 sm:pt-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-end lg:gap-10 lg:p-10">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md bg-series-accent px-2 py-0.5 text-xs font-bold tracking-wide text-series-accent-foreground">
              {info.shortName}
            </span>
            <span className="font-medium text-muted-foreground">
              {info.name} · {round.season} season
            </span>
          </p>
          <h1 className="mt-4 text-[2.35rem] leading-[0.98] font-extrabold tracking-tighter text-balance sm:text-6xl lg:text-7xl">
            {round.name}
          </h1>
          <dl className="mt-6 grid gap-2.5 text-sm sm:text-base">
            <div className="flex items-start gap-2.5">
              <dt className="sr-only">Circuit</dt>
              <MapPinIcon className="mt-0.5 size-4 shrink-0 text-series-accent sm:mt-1" aria-hidden />
              <dd>
                <span className="font-semibold">{circuit.name}</span>
                <span className="text-muted-foreground"> · {circuit.location}</span>
              </dd>
            </div>
            <div className="flex items-start gap-2.5">
              <dt className="sr-only">Dates</dt>
              <CalendarIcon className="mt-0.5 size-4 shrink-0 text-series-accent sm:mt-1" aria-hidden />
              <dd>
                <span className="font-semibold">{formatRoundDates(round.startDate, round.endDate)}</span>
                {!round.sessionTimesConfirmed && (
                  <span className="ml-2 rounded-full border border-border px-2 py-0.5 align-middle text-xs font-semibold text-muted-foreground">
                    Times TBC
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>
        {countdown && <div className="min-w-0 lg:justify-self-end lg:w-full lg:max-w-md">{countdown}</div>}
      </div>
    </HeroShell>
  );
}

export function SeasonCompleteHero({ series, season }: { series: SeriesId; season: number }) {
  const info = SERIES[series];
  return (
    <HeroShell series={series}>
      <div className="p-6 py-12 sm:p-10 sm:py-16">
        <FlagIcon className="size-8 text-series-accent" aria-hidden />
        <p className="mt-5 text-sm font-semibold text-muted-foreground">
          {info.name} · {season} season
        </p>
        <h1 className="mt-2 text-4xl leading-[1.02] font-extrabold tracking-tighter text-balance sm:text-6xl">
          Season complete — back in {season + 1}
        </h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          The {season} {info.shortName} season is over. The first Round of {season + 1} will show here as soon as its
          dates are published.
        </p>
        <p className="mt-6">
          <Link href="/" className="text-sm font-semibold text-series-accent underline-offset-4 hover:underline">
            Choose another Series
          </Link>
        </p>
      </div>
    </HeroShell>
  );
}
