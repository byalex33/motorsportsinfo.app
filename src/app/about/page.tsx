import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageTransition } from "@/components/motion/page-transition";
import { RevealWords } from "@/components/motion/reveal-words";
import { ENTER, enterDelay, staggerDelay } from "@/lib/motion";

export const metadata: Metadata = {
  title: "About",
  description:
    "What motorsportsinfo.app is, where its schedule and weather data come from, how your privacy is protected, and who it is not affiliated with.",
  alternates: { canonical: "/about" },
};

const a = "text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary";

function Section({ id, index, title, children }: { id: string; index: number; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="enter-rise grid gap-4 border-t border-border pt-5 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10"
      style={staggerDelay(index, ENTER.body, 50, 3)}
    >
      <h2 id={id} className="eyebrow pt-1 text-muted-foreground">
        {title}
      </h2>
      <div className="max-w-[65ch] space-y-4 leading-relaxed text-pretty text-foreground/90">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-10 pb-20 sm:px-6 sm:pt-16">
        <p className="eyebrow enter-rise flex items-center gap-2 text-muted-foreground" style={enterDelay(ENTER.eyebrow)}>
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          About
        </p>
        <h1 className="mt-4 max-w-3xl text-[2.25rem] leading-[1.05] font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
          <RevealWords text="A fan-made guide to when Sessions run and what the weather will do." />
        </h1>
        <p className="enter-rise mt-5 max-w-2xl leading-relaxed text-pretty text-muted-foreground sm:text-lg" style={enterDelay(ENTER.lead)}>
          motorsportsinfo.app shows the Featured Round for F1, F2, F3, the WEC, Formula E, IndyCar and MotoGP — the
          Round in progress, or the next one — with every Session in your time or Track Time, a live countdown, the
          forecast at the Circuit for each Session and a rain radar around Session time. It is free, has no ads and no
          accounts.
        </p>

        <div className="mt-14 space-y-12 sm:mt-20">
          <Section id="what" index={0} title="What it is">
            <p>
              Pick a Series and you get one page: the Round that matters now. Times are shown in your device&apos;s time
              zone by default; you can switch to Track Time (the Circuit&apos;s time zone) or any other zone, and choose
              °C or °F and km/h or mph. Cancelled Sessions stay in the list, marked as cancelled. For F1, F2 and F3
              the page also lists the FIA&apos;s documents for the Round as they are published — stewards&apos;
              decisions, classifications and notes — each opening right here on the site.
            </p>
            <p>
              <Link href="/alerts" className={a}>
                Alerts
              </Link>{" "}
              lets you get a Session Reminder before the Sessions you follow, hear about Schedule Changes, or subscribe
              to a calendar.
            </p>
          </Section>

          <Section id="sources" index={1} title="Data sources & credits">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="font-medium text-foreground">F1 schedule:</strong>{" "}
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
                <strong className="font-medium text-foreground">F1 Session Results:</strong> the full classification of
                each finished Session, from OpenF1, behind a spoiler warning. Other Series link to their official results pages.
              </li>
              <li>
                <strong className="font-medium text-foreground">F1 Telemetry:</strong> car data, positions and lap times
                from OpenF1, available once a Session has finished.
              </li>
              <li>
                <strong className="font-medium text-foreground">F2 and F3 schedules:</strong> from the official timetables published on the FIA Formula 2 and
                FIA Formula 3 websites, with the sportstimes/f1 dataset as a fallback.
              </li>
              <li>
                <strong className="font-medium text-foreground">WEC schedule:</strong> from the official timetables published on the FIA WEC website.
              </li>
              <li>
                <strong className="font-medium text-foreground">Formula E, IndyCar and MotoGP schedules:</strong> from the{" "}
                <a className={a} href="https://github.com/sportstimes/f1" target="_blank" rel="noopener noreferrer">
                  sportstimes/f1
                </a>{" "}
                dataset, licensed MIT.
              </li>
              <li>
                <strong className="font-medium text-foreground">FIA documents:</strong>{" "}
                <a className={a} href="https://www.fia.com/documents" target="_blank" rel="noopener noreferrer">
                  Documents: FIA
                </a>
                . Titles and publish times from the FIA&apos;s document pages for F1, F2 and F3. The documents are the
                FIA&apos;s own PDFs, passed through unchanged and shown on this site with PDF.js; each one can still be
                downloaded.
              </li>
              <li>
                <strong className="font-medium text-foreground">Weather:</strong>{" "}
                <a className={a} href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
                  Weather data by Open-Meteo.com
                </a>{" "}
                (CC BY 4.0), used on its free, non-commercial tier.
              </li>
              <li>
                <strong className="font-medium text-foreground">Rain radar:</strong>{" "}
                <a className={a} href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">
                  Radar: RainViewer
                </a>
                .
              </li>
              <li>
                <strong className="font-medium text-foreground">Maps:</strong>{" "}
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

          <Section id="privacy" index={2} title="Privacy">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="font-medium text-foreground">No accounts.</strong> There is nothing to sign up for.
              </li>
              <li>
                <strong className="font-medium text-foreground">Your preferences stay on your device.</strong> Your last Series, time zone choice, units and
                theme are kept in your browser&apos;s local storage and are never sent to us.
              </li>
              <li>
                <strong className="font-medium text-foreground">Push notifications</strong> are optional. If you turn them on, we store an anonymous browser push
                endpoint together with the Series, Session Types, reminder lead time and FIA document alerts you chose —
                nothing else. You can
                remove it at any time from{" "}
                <Link href="/alerts" className={a}>
                  Alerts
                </Link>
                .
              </li>
              <li>
                <strong className="font-medium text-foreground">Calendar links</strong> contain only your choices of Series and Session Types.
              </li>
              <li>
                <strong className="font-medium text-foreground">Analytics</strong> are privacy-friendly, provided by Tracwell, and respect Do Not Track: if your
                browser sends it, nothing is recorded.
              </li>
            </ul>
          </Section>

          <Section id="disclaimer" index={3} title="Disclaimer">
            <p>
              Unofficial. Not affiliated with Formula 1, the FIA, the ACO, the WEC, Formula E, INDYCAR, MotoGP or Dorna
              Sports. F1, Formula 1, Formula E, IndyCar, MotoGP and related marks are trademarks of their respective
              owners. Each Series&apos; colour is used only to tell the Series apart; there are no official logos on this
              site.
            </p>
            <p className="text-sm text-muted-foreground">
              Session times and forecasts are provided as-is and can change at short notice. Always check official
              channels before travelling.
            </p>
          </Section>
        </div>
      </main>
    </PageTransition>
  );
}
