"use client";
// CONTRACT — owned by the radar work. Decides its own visibility:
// shows from RADAR_LEAD_MINUTES before a Session starts until it ends.
import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { CloudOff } from "lucide-react";
import type { Circuit, Session } from "@/domain/types";
import { track } from "@/lib/analytics";
import { RadarCard, RadarMapPlaceholder } from "./radar-card";
import { radarWindowSession } from "./radar-window";
import { useMinuteClock } from "./use-client-state";

export interface RadarPanelProps {
  circuit: Circuit;
  sessions: Session[];
}

export function RadarPanel({ circuit, sessions }: RadarPanelProps) {
  // Null until hydrated: the radar never renders on the server, and re-evaluates every minute.
  const now = useMinuteClock();
  const session = now === null ? null : radarWindowSession(sessions, now);
  const showMap = session !== null && circuit.hasRadarCoverage;
  const series = session?.series;

  const tracked = useRef(false);
  useEffect(() => {
    if (!showMap || !series || tracked.current) return;
    tracked.current = true;
    track("radar_opened", { series });
  }, [showMap, series]);

  if (now === null || session === null) return null;

  if (!circuit.hasRadarCoverage) {
    return (
      <RadarCard circuitName={circuit.name}>
        <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
          <CloudOff className="size-4 shrink-0" aria-hidden="true" />
          No radar coverage at this circuit
        </p>
      </RadarCard>
    );
  }

  return <RadarMap circuit={circuit} nowMs={now} />;
}

const RadarMap = dynamic(() => import("./radar-map"), {
  ssr: false,
  loading: () => <RadarMapPlaceholder circuitName="" />,
});
