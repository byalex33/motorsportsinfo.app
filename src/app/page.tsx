import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { PageTransition } from "@/components/motion/page-transition";
import { SeriesPickerDialog } from "@/components/series-picker-dialog";
import { SERIES, SESSION_TYPE_LABELS } from "@/domain/series";
import { SERIES_IDS } from "@/domain/types";
import { homeJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "motorsportsinfo.app — session times & weather for F1, F2, F3, WEC, Formula E, IndyCar and MotoGP",
  absoluteTitle: true,
  description:
    "Pick a Series to see the next Round's Session times in your time zone, a live countdown and the forecast for each Session.",
  path: "/",
});

export default function HomePage() {
  return (
    <PageTransition>
      <main className="flex-1">
        <JsonLd data={homeJsonLd()} />
        <h1 className="sr-only">motorsportsinfo.app — session times and weather for F1, F2, F3, WEC, Formula E, IndyCar and MotoGP</h1>
        {/*
          The picker opens as a modal, which renders in a portal on the client only. The same choices are
          here in the server HTML, visually hidden (the modal covers the page), so crawlers and assistive
          tech without JavaScript still get every Series and its link.
        */}
        <nav aria-label="All Series" className="sr-only">
          <ul>
            {SERIES_IDS.map((id) => {
              const info = SERIES[id];
              return (
                <li key={id}>
                  <Link href={`/${id}`} prefetch={false}>
                    {info.shortName} — {info.name}
                  </Link>
                  : {info.sessionTypes.map((t) => SESSION_TYPE_LABELS[t]).join(", ")} times for the next Round, in your time
                  zone or Track Time, with the weather forecast at the Circuit.
                </li>
              );
            })}
          </ul>
        </nav>
        <SeriesPickerDialog />
      </main>
    </PageTransition>
  );
}
