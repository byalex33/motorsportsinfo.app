"use client";

import { InlineSkeleton } from "@/components/inline-skeleton";
import { useDisplayZone } from "@/components/round/use-display-zone";
import { formatClock, formatSessionDay, zoneOffsetLabel } from "@/lib/time-format";

/**
 * "Published Friday 9 October, 18:00 GMT+1" in the zone the viewer shows times in. The offset matters here:
 * the PDF itself gives the time in the Circuit's zone, which is often another day.
 */
export function DocumentPublished({ at, circuitTimeZone }: { at: string; circuitTimeZone: string }) {
  const zone = useDisplayZone(circuitTimeZone);
  if (!zone) return <InlineSkeleton className="h-4 w-64" />;
  return (
    <time key={zone.tz} dateTime={at} className="enter-focus">
      Published {formatSessionDay(at, zone.tz).long}, {formatClock(at, zone.tz)} {zoneOffsetLabel(zone.tz, new Date(at))}
    </time>
  );
}
