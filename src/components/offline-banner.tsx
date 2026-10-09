"use client";

import { WifiOffIcon } from "lucide-react";
import { useOnline, usePageStamp } from "@/lib/client-stores";
import { dayKey, deviceTimeZone, formatClock, formatSessionDay } from "@/lib/time-format";

function formatStamp(iso: string): string {
  const tz = deviceTimeZone();
  const time = formatClock(iso, tz);
  if (dayKey(iso, tz) === dayKey(new Date().toISOString(), tz)) return time;
  const day = formatSessionDay(iso, tz);
  return `${day.weekday} ${day.day} ${day.month}, ${time}`;
}

/** "Offline · last updated {time}" — the time the page's schedule data was rendered on the server. */
export function OfflineBanner() {
  const online = useOnline();
  const stamp = usePageStamp();
  if (online) return null;
  return (
    <div role="status" className="border-b border-amber-500/30 bg-amber-100 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100">
      <p className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-sm font-medium sm:px-6">
        <WifiOffIcon className="size-4 shrink-0" aria-hidden />
        <span>
          Offline{stamp ? <> · last updated {formatStamp(stamp)}</> : " · showing the last saved copy"}
        </span>
      </p>
    </div>
  );
}
