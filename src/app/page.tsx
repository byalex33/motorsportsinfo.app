import type { Metadata } from "next";
import { PageTransition } from "@/components/motion/page-transition";
import { SeriesPickerDialog } from "@/components/series-picker-dialog";

export const metadata: Metadata = {
  title: { absolute: "motorsportsinfo.app — session times & weather for F1, F2, F3 and WEC" },
  description:
    "Pick a Series to see the next Round's Session times in your time zone, a live countdown and the forecast for each Session.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <PageTransition>
      <main className="flex-1">
        <h1 className="sr-only">motorsportsinfo.app — session times and weather for F1, F2, F3 and WEC</h1>
        <SeriesPickerDialog />
      </main>
    </PageTransition>
  );
}
