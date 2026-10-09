"use client";

import { InlineSkeleton } from "@/components/inline-skeleton";
import { useDisplayZone } from "@/components/round/use-display-zone";
import { formatClock, formatSessionDay } from "@/lib/time-format";

/** "Published Friday 9 October, 18:00" in the zone the viewer shows times in. */
export function DocumentPublished({ at, circuitTimeZone }: { at: string; circuitTimeZone: string }) {
  const zone = useDisplayZone(circuitTimeZone);
  if (!zone) return <InlineSkeleton className="h-4 w-56" />;
  return (
    <time key={zone.tz} dateTime={at} className="enter-focus">
      Published {formatSessionDay(at, zone.tz).long}, {formatClock(at, zone.tz)}
    </time>
  );
}
