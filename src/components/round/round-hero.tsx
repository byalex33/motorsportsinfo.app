import Link from "next/link";
import type { ReactNode } from "react";
import { SERIES } from "@/domain/series";
import type { Circuit, Round, SeriesId } from "@/domain/types";
import { formatRoundDates } from "@/lib/time-format";

/** "● F1 · Formula 1 · 2026 season" — the micro-label above the Round name. */
function SeriesLine({ series, season }: { series: SeriesId; season: number }) {
  const info = SERIES[series];
  return (
    <p className="eyebrow flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
      <span className="inline-flex items-center gap-2 font-semibold text-series-accent">
        <span aria-hidden className="size-1.5 rounded-full bg-series-accent" />
        {info.shortName}
      </span>
      <span aria-hidden>·</span>
      <span>{info.name}</span>
      <span aria-hidden>·</span>
      <span>{season} season</span>
    </p>
  );
}

const meta = "font-mono text-[0.8125rem] leading-5 tracking-[0.04em] uppercase";

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
  return (
    <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-12">
      <div className="min-w-0">
        <SeriesLine series={series} season={round.season} />
        <h1 className="mt-4 text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.045em] text-balance sm:text-6xl">
          {round.name}
        </h1>
        <dl className={`${meta} mt-5 grid gap-1 text-muted-foreground`}>
          <div className="min-w-0">
            <dt className="sr-only">Circuit</dt>
            <dd>
              <span className="text-foreground">{circuit.name}</span>
              <span> · {circuit.location}</span>
            </dd>
          </div>
          <div>
            <dt className="sr-only">Dates</dt>
            <dd className="flex items-center gap-2 tabular">
              {formatRoundDates(round.startDate, round.endDate)}
              {!round.sessionTimesConfirmed && <span className="chip border border-border text-muted-foreground">Times TBC</span>}
            </dd>
          </div>
        </dl>
      </div>
      {countdown && <div className="min-w-0">{countdown}</div>}
    </section>
  );
}

export function SeasonCompleteHero({ series, season }: { series: SeriesId; season: number }) {
  const info = SERIES[series];
  return (
    <section className="max-w-3xl">
      <SeriesLine series={series} season={season} />
      <h1 className="mt-4 text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.045em] text-balance sm:text-6xl">
        Season complete — back in {season + 1}
      </h1>
      <p className="mt-5 max-w-xl leading-relaxed text-muted-foreground">
        The {season} {info.shortName} season is over. The first Round of {season + 1} will show here as soon as its dates
        are published.
      </p>
      <p className="mt-8 border-t border-border pt-5">
        <Link
          href="/"
          className="eyebrow inline-flex items-center gap-2 text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Choose another Series <span aria-hidden>→</span>
        </Link>
      </p>
    </section>
  );
}
