import { ArrowUpRightIcon, CalendarDaysIcon, MapPinIcon, PlayIcon, RouteIcon, SparklesIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { RevealWords } from "@/components/motion/reveal-words";
import { SERIES } from "@/domain/series";
import type { Circuit, Round, SeriesId, SpecialEvent } from "@/domain/types";
import { ENTER, enterDelay } from "@/lib/motion";
import { formatRoundDates } from "@/lib/time-format";

/** "● F1 · Formula 1 · 2026 season" — the micro-label above a Series page's headline when no Round is featured. */
function SeriesLine({ series, season }: { series: SeriesId; season?: number }) {
  const info = SERIES[series];
  return (
    <p className="eyebrow enter-rise flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-muted-foreground" style={enterDelay(ENTER.eyebrow)}>
      <span className="inline-flex items-center gap-2 font-semibold text-series-accent">
        <span aria-hidden className="size-1.5 rounded-full bg-series-gradient" />
        {info.shortName}
      </span>
      {info.name !== info.shortName && (
        <>
          <span aria-hidden>·</span>
          <span>{info.name}</span>
        </>
      )}
      {season !== undefined && (
        <>
          <span aria-hidden>·</span>
          <span>{season} season</span>
        </>
      )}
    </p>
  );
}

function MetaItem({ icon: Icon, label, style, children }: { icon: LucideIcon; label: string; style: CSSProperties; children: ReactNode }) {
  return (
    <div className="enter-rise flex min-w-0 items-center gap-2" style={style}>
      <dt className="sr-only">{label}</dt>
      <Icon size={16} strokeWidth={1.75} className="shrink-0 text-series-accent" aria-hidden />
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export function RoundHero({
  round,
  roundNumber,
  circuit,
  countdown,
}: {
  round: Round;
  /** null for a Round the Series doesn't number: the season is shown instead. */
  roundNumber: number | null;
  circuit: Circuit;
  countdown: ReactNode;
}) {
  // F2 and F3 Rounds are already named "Round 13", and NASCAR's exhibition races aren't numbered: the label
  // then shows the season instead.
  const namedByNumber = round.name === `Round ${roundNumber}`;
  return (
    <section className="flex flex-col items-center text-center">
      <p className="eyebrow enter-rise text-muted-foreground" style={enterDelay(ENTER.eyebrow)}>
        {namedByNumber || roundNumber === null ? `${round.season} season` : `Round ${roundNumber}`}
      </p>
      <h1 className="mt-4 max-w-4xl text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.045em] text-balance sm:text-6xl">
        <RevealWords text={round.name} />
      </h1>
      <dl className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <MetaItem icon={RouteIcon} label="Circuit" style={enterDelay(ENTER.meta)}>
          <span className="font-medium text-foreground">{circuit.name}</span>
        </MetaItem>
        <MetaItem icon={MapPinIcon} label="Location" style={enterDelay(ENTER.meta + ENTER.metaStep)}>
          {circuit.location}
        </MetaItem>
        <MetaItem icon={CalendarDaysIcon} label="Dates" style={enterDelay(ENTER.meta + 2 * ENTER.metaStep)}>
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

/** A Special Event's hero: like RoundHero, in the event's accent (the site's own colour unless it has one), with what it is and where to watch it. */
export function SpecialEventHero({ event, countdown }: { event: SpecialEvent; countdown: ReactNode }) {
  return (
    <section className="flex flex-col items-center text-center">
      <p className="eyebrow enter-rise flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-muted-foreground" style={enterDelay(ENTER.eyebrow)}>
        <span className="inline-flex items-center gap-1.5 font-semibold text-series-accent">
          <SparklesIcon className="size-3" aria-hidden />
          Special
        </span>
        <span aria-hidden>·</span>
        <span>{event.championship}</span>
      </p>
      <h1 className="mt-4 max-w-4xl text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.045em] text-balance sm:text-6xl">
        <RevealWords text={event.name} />
      </h1>
      <p className="enter-rise mt-5 max-w-2xl leading-relaxed text-pretty text-muted-foreground" style={enterDelay(ENTER.lead)}>
        {event.summary}
      </p>
      <dl className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <MetaItem icon={RouteIcon} label="Circuit" style={enterDelay(ENTER.meta)}>
          <span className="font-medium text-foreground">{event.circuit.name}</span>
        </MetaItem>
        <MetaItem icon={MapPinIcon} label="Location" style={enterDelay(ENTER.meta + ENTER.metaStep)}>
          {event.circuit.location}
        </MetaItem>
        <MetaItem icon={CalendarDaysIcon} label="Dates" style={enterDelay(ENTER.meta + 2 * ENTER.metaStep)}>
          <span className="tabular">{formatRoundDates(event.startDate, event.endDate)}</span>
        </MetaItem>
        {event.watch && (
          <MetaItem icon={PlayIcon} label="Watch" style={enterDelay(ENTER.meta + 3 * ENTER.metaStep)}>
            <a
              href={event.watch.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-series-accent underline decoration-series-accent/30 underline-offset-4 transition-colors outline-none hover:decoration-series-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              {event.watch.label}
              <ArrowUpRightIcon className="size-3.5" aria-hidden />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </MetaItem>
        )}
      </dl>
      {countdown && (
        <div className="enter-rise mt-10 w-full min-w-0 border-t border-border pt-10 sm:mt-12 sm:pt-12" style={enterDelay(ENTER.countdown)}>
          {countdown}
        </div>
      )}
    </section>
  );
}

function ChooseAnotherSeries() {
  return (
    <p className="enter-rise mt-8 w-full max-w-xl border-t border-border pt-5" style={enterDelay(ENTER.body)}>
      <Link
        href="/"
        className="eyebrow inline-flex items-center gap-2 text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Choose another Series <span aria-hidden>→</span>
      </Link>
    </p>
  );
}

export function SeasonCompleteHero({ series, season }: { series: SeriesId; season: number }) {
  const info = SERIES[series];
  return (
    // Centred like RoundHero, so the Series line sits over the headline.
    <section className="mx-auto flex max-w-3xl flex-col items-center text-center">
      <SeriesLine series={series} season={season} />
      <h1 className="mt-4 text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.045em] text-balance sm:text-6xl">
        <RevealWords text="Season complete" />
      </h1>
      <p className="enter-rise mt-5 max-w-xl leading-relaxed text-pretty text-muted-foreground" style={enterDelay(ENTER.lead)}>
        The {info.shortName} season is over. The next Round will show here as soon as its dates are published.
      </p>
      <ChooseAnotherSeries />
    </section>
  );
}

/** No schedule to read yet (a Series whose source is not connected, or every source failed without a database). */
export function ScheduleUnavailableHero({ series }: { series: SeriesId }) {
  const info = SERIES[series];
  return (
    // Centred like RoundHero, so the Series line sits over the headline.
    <section className="mx-auto flex max-w-3xl flex-col items-center text-center">
      <SeriesLine series={series} />
      <h1 className="mt-4 text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.045em] text-balance sm:text-6xl">
        <RevealWords text="Schedule coming soon" />
      </h1>
      <p className="enter-rise mt-5 max-w-xl leading-relaxed text-pretty text-muted-foreground" style={enterDelay(ENTER.lead)}>
        We can&apos;t show the {info.name} schedule right now. The next Round, with every Session in your time and the
        forecast at the Circuit, will appear here as soon as it is available.
      </p>
      <ChooseAnotherSeries />
    </section>
  );
}
