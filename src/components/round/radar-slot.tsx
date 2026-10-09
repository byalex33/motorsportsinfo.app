"use client";

import { RadarIcon } from "lucide-react";
import { RadarPanel } from "@/components/radar/radar-panel";
import type { Circuit, Session } from "@/domain/types";
import { useNow, useOnline } from "@/lib/client-stores";
import { isRadarWindow } from "@/lib/round-status";

/** The radar decides its own visibility; offline, show a notice instead while it would be on. */
export function RadarSlot({ circuit, sessions }: { circuit: Circuit; sessions: Session[] }) {
  const online = useOnline();
  const now = useNow(60_000);

  if (!online) {
    if (now === null || !isRadarWindow(sessions, now)) return null;
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
        <RadarIcon className="size-5 shrink-0" aria-hidden />
        Rain radar unavailable offline
      </div>
    );
  }
  return <RadarPanel circuit={circuit} sessions={sessions} />;
}
