import type { Metadata } from "next";
import { AlertsPanel } from "@/components/alerts/alerts-panel";
import { PageTransition } from "@/components/motion/page-transition";
import { RevealWords } from "@/components/motion/reveal-words";
import { ENTER, enterDelay } from "@/lib/motion";

export const metadata: Metadata = {
  title: "Alerts",
  description:
    "Session Reminders on your phone or computer, and a calendar feed of F1, F2, F3 and WEC Session times that updates when the schedule changes.",
};

export default function AlertsPage() {
  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-10 pb-20 sm:px-6 sm:pt-16">
        <header className="mb-12 sm:mb-16">
          <p className="eyebrow enter-rise flex items-center gap-2 text-muted-foreground" style={enterDelay(ENTER.eyebrow)}>
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            Session Reminders · Calendar feed
          </p>
          <h1 className="mt-4 text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.045em] sm:text-6xl">
            <RevealWords text="Alerts" />
          </h1>
          <p className="enter-rise mt-5 max-w-2xl leading-relaxed text-pretty text-muted-foreground sm:text-lg" style={enterDelay(ENTER.meta)}>
            Get a Session Reminder before the Sessions you follow, or put them in your calendar. Covers F1, F2, F3 and WEC.
          </p>
        </header>
        <AlertsPanel />
      </main>
    </PageTransition>
  );
}
