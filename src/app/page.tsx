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
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-14 pb-20 sm:px-6 sm:pt-24">
      <p className="eyebrow flex items-center gap-2 text-muted-foreground">
        <span aria-hidden className="size-1.5 rounded-full bg-primary" />
        Session times &amp; weather
      </p>
      <h1 className="mt-5 max-w-3xl text-[2.6rem] leading-[1.02] font-semibold tracking-[-0.045em] text-balance sm:text-[4.5rem]">
        When it runs, and what the sky will do.
      </h1>
      <p className="mt-5 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
        Choose a Series to see its next Round: every Session in your time, a live countdown, the forecast at the Circuit
        and rain radar when it matters.
      </p>

      <div className="mt-14 sm:mt-20">
        <div className="flex items-baseline justify-between pb-3">
          <h2 className="eyebrow text-muted-foreground">Choose a Series</h2>
          <p className="eyebrow text-muted-foreground">4 Series</p>
        </div>
        <SeriesPicker />
      </div>
    </main>
  );
}
