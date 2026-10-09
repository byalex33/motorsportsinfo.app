import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "About",
  description:
    "What motorsportsinfo.app is, where its schedule and weather data come from, how your privacy is protected, and who it is not affiliated with.",
  alternates: { canonical: "/about" },
};

const a = "font-medium text-primary underline-offset-4 hover:underline";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-3 border-t border-border pt-8 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
      <h2 id={id} className="text-lg font-bold tracking-tight">
        {title}
      </h2>
      <div className="space-y-4 leading-relaxed text-pretty text-foreground/85">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
      <p className="text-sm font-semibold tracking-wide text-primary uppercase">About</p>
      <h1 className="mt-3 text-4xl leading-[1.05] font-extrabold tracking-tighter text-balance sm:text-5xl">
        A fan-made guide to when Sessions run and what the weather will do.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">
        motorsportsinfo.app shows the Featured Round for F1, F2, F3 and the WEC — the Round in progress, or the next
        one — with every Session in your time or Track Time, a live countdown, the forecast at the Circuit for each
        Session and a rain radar around Session time. It is free, has no ads and no accounts.
      </p>

      <div className="mt-12 space-y-10">
        <Section id="what" title="What it is">
          <p>
            Pick a Series and you get one page: the Round that matters now. Times are shown in your device&apos;s time
            zone by default; you can switch to Track Time (the Circuit&apos;s time zone) or any other zone, and choose
            °C or °F and km/h or mph. Cancelled Sessions stay in the list, marked as cancelled.
          </p>
          <p>
            <Link href="/alerts" className={a}>
              Alerts
            </Link>{" "}
            lets you get a Session Reminder before the Sessions you follow, hear about Schedule Changes, or subscribe
            to a calendar.
          </p>
        </Section>

        <Section id="sources" title="Data sources & credits">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>F1 schedule:</strong>{" "}
              <a className={a} href="https://openf1.org" target="_blank" rel="noopener noreferrer">
                Data: OpenF1
              </a>
              , with{" "}
              <a className={a} href="https://jolpi.ca" target="_blank" rel="noopener noreferrer">
                Jolpica
              </a>{" "}
              as a fallback. Both are licensed CC BY-NC-SA 4.0.
            </li>
            <li>
              <strong>F2 and F3 schedules:</strong> from the official timetables published on the FIA Formula 2 and
              FIA Formula 3 websites, with the MIT-licensed sportstimes/f1 dataset as a fallback.
            </li>
            <li>
              <strong>WEC schedule:</strong> from the official timetables published on the FIA WEC website.
            </li>
            <li>
              <strong>Weather:</strong>{" "}
              <a className={a} href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
                Weather data by Open-Meteo.com
              </a>{" "}
              (CC BY 4.0), used on its free, non-commercial tier.
            </li>
            <li>
              <strong>Rain radar:</strong>{" "}
              <a className={a} href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">
                Radar: RainViewer
              </a>
              .
            </li>
            <li>
              <strong>Maps:</strong>{" "}
              <a className={a} href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">
                © OpenFreeMap
              </a>{" "}
              <a className={a} href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">
                © OpenMapTiles
              </a>{" "}
              <a className={a} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
                © OpenStreetMap contributors
              </a>
              .
            </li>
          </ul>
          <p>
            Sources can be wrong or slow to update. When they are, we correct Sessions by hand with a Schedule
            Override until the source catches up. Because these sources are free for non-commercial use, this site
            will stay non-commercial: no ads and no paid features.
          </p>
        </Section>

        <Section id="privacy" title="Privacy">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>No accounts.</strong> There is nothing to sign up for.
            </li>
            <li>
              <strong>Your preferences stay on your device.</strong> Your last Series, time zone choice, units and
              theme are kept in your browser&apos;s local storage and are never sent to us.
            </li>
            <li>
              <strong>Push notifications</strong> are optional. If you turn them on, we store an anonymous browser push
              endpoint together with the Series, Session Types and reminder lead time you chose — nothing else. You can
              remove it at any time from{" "}
              <Link href="/alerts" className={a}>
                Alerts
              </Link>
              .
            </li>
            <li>
              <strong>Calendar links</strong> contain only your choices of Series and Session Types.
            </li>
            <li>
              <strong>Analytics</strong> are privacy-friendly, provided by Tracwell, and respect Do Not Track: if your
              browser sends it, nothing is recorded.
            </li>
          </ul>
        </Section>

        <Section id="disclaimer" title="Disclaimer">
          <p>
            Unofficial. Not affiliated with Formula 1, the FIA, the ACO or the WEC. F1, Formula 1 and related marks are
            trademarks of their respective owners.
          </p>
          <p className="text-sm text-muted-foreground">
            Session times and forecasts are provided as-is and can change at short notice. Always check official
            channels before travelling.
          </p>
        </Section>
      </div>
    </main>
  );
}
