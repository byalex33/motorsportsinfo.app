import type { Metadata } from "next";
import { SeriesPicker } from "@/components/series-picker";

export const metadata: Metadata = {
  title: { absolute: "motorsportsinfo.app — session times & weather for F1, F2, F3 and WEC" },
  description:
    "Pick a Series to see the next Round's Session times in your time zone, a live countdown and the forecast for each Session.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-72 max-w-3xl rounded-full bg-primary/15 blur-3xl"
      />
      <div className="max-w-2xl">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">Session times &amp; weather</p>
        <h1 className="mt-3 text-[2.15rem] leading-[1.05] font-extrabold tracking-tighter text-balance sm:text-6xl">
          When it runs, and what the sky will do.
        </h1>
        <p className="mt-4 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
          Choose a Series to see its next Round: every Session in your time, a live countdown, the forecast at the
          Circuit and rain radar when it matters.
        </p>
      </div>
      <h2 className="sr-only">Choose a Series</h2>
      <div className="mt-8 sm:mt-12">
        <SeriesPicker />
      </div>
    </main>
  );
}
