import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { SERIES } from "@/domain/series";
import { SERIES_IDS } from "@/domain/types";
import { ENTER, staggerDelay } from "@/lib/motion";

/** Every Series as a plain link row: the way back on track from the 404 and error pages. Server-safe. */
export function SeriesLinkList() {
  return (
    <ul className="max-w-xl divide-y divide-border border-y border-border">
      {SERIES_IDS.map((id, i) => (
        <li key={id} data-series={id} className="enter-rise" style={staggerDelay(i, ENTER.body, 30)}>
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
  );
}
