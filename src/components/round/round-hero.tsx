import { Calendar03Icon, Location01Icon, Route03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { RevealWords } from "@/components/motion/reveal-words";
import { SERIES } from "@/domain/series";
import type { Circuit, Round, SeriesId } from "@/domain/types";
import { ENTER, enterDelay } from "@/lib/motion";
import { formatRoundDates } from "@/lib/time-format";

/** "● F1 · Formula 1 · 2026 season" — the micro-label above the Round name. */
function SeriesLine({ series, season }: { series: SeriesId; season: number }) {
  const info = SERIES[series];
  return (
    <p className="eyebrow enter-rise flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-muted-foreground" style={enterDelay(ENTER.eyebrow)}>
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

function MetaItem({ icon, label, style, children }: { icon: IconSvgElement; label: string; style: CSSProperties; children: ReactNode }) {
  return (
    <div className="enter-rise flex min-w-0 items-center gap-2" style={style}>
      <dt className="sr-only">{label}</dt>
      <HugeiconsIcon icon={icon} size={16} strokeWidth={1.75} className="shrink-0 text-series-accent" aria-hidden />
      <dd className="min-w-0">{children}</dd>
    </div>
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
  return (
    <section className="flex flex-col items-center text-center">
      <SeriesLine series={series} season={round.season} />
      <h1 className="mt-4 max-w-4xl text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.045em] text-balance sm:text-6xl">
        <RevealWords text={round.name} />
      </h1>
      <dl className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <MetaItem icon={Route03Icon} label="Circuit" style={enterDelay(ENTER.meta)}>
          <span className="font-medium text-foreground">{circuit.name}</span>
        </MetaItem>
        <MetaItem icon={Location01Icon} label="Location" style={enterDelay(ENTER.meta + ENTER.metaStep)}>
          {circuit.location}
        </MetaItem>
        <MetaItem icon={Calendar03Icon} label="Dates" style={enterDelay(ENTER.meta + 2 * ENTER.metaStep)}>
          <span className="flex items-center gap-2 tabular">
            {formatRoundDates(round.startDate, round.endDate)}
            {!round.sessionTimesConfirmed && <span className="chip border border-border text-muted-foreground">Times TBC</span>}
          </span>
        </MetaItem>
      </dl>
      {countdown && (
        <div className="enter-rise mt-10 w-full min-w-0 border-t border-border pt-10 sm:mt-12 sm:pt-12" style={enterDelay(ENTER.countdown)}>
          {countdown}
        </div>
      )}
    </section>
  );
}

export function SeasonCompleteHero({ series, season }: { series: SeriesId; season: number }) {
  const info = SERIES[series];
  return (
    <section className="max-w-3xl">
      <SeriesLine series={series} season={season} />
      <h1 className="mt-4 text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.045em] text-balance sm:text-6xl">
        <RevealWords text={`Season complete — back in ${season + 1}`} />
      </h1>
      <p className="enter-rise mt-5 max-w-xl leading-relaxed text-muted-foreground" style={enterDelay(ENTER.lead)}>
        The {season} {info.shortName} season is over. The first Round of {season + 1} will show here as soon as its dates
        are published.
      </p>
      <p className="enter-rise mt-8 border-t border-border pt-5" style={enterDelay(ENTER.body)}>
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
