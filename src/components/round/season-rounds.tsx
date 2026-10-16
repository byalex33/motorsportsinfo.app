import Link from "next/link";
import type { SeasonRoundLink } from "@/app/[series]/data";
import { SERIES } from "@/domain/series";
import type { SeriesId } from "@/domain/types";
import { cn } from "@/lib/utils";

/**
 * Every Round the Series has a page for. The list is the crawl path between the Series and each Round;
 * prefetch stays off because most of these pages are rendered on their first request, not at build.
 */
export function SeasonRounds({ series, rounds }: { series: SeriesId; rounds: SeasonRoundLink[] }) {
  if (rounds.length === 0) return null;
  const seasons = [...new Set(rounds.map((round) => round.season))].sort((a, b) => a - b);
  const info = SERIES[series];

  return (
    <section id="rounds" aria-labelledby="rounds-heading" className="scroll-mt-24 space-y-8">
      <h2 id="rounds-heading" className="eyebrow text-muted-foreground">
        {info.shortName} Rounds
      </h2>
      {seasons.map((season) => (
        <div key={season}>
          <h3 className="text-sm font-medium text-foreground">{season}</h3>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {rounds
              .filter((round) => round.season === season)
              .map((round) => (
                <li key={round.id}>
                  <Link
                    href={round.path}
                    prefetch={false}
                    className="flex items-baseline justify-between gap-4 py-3 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <span className="min-w-0">
                      <span className={cn("font-medium", round.featured && "text-foreground")}>{round.name}</span>
                      {round.featured && (
                        <span className="chip ml-2 bg-series-accent/15 text-series-accent ring-1 ring-series-accent/30">Featured</span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground tabular">{round.dates}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
