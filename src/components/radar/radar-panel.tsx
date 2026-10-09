"use client";
// CONTRACT — owned by the radar work. Decides its own visibility:
// shows from RADAR_LEAD_MINUTES before a Session starts until it ends.
import type { Circuit, Session } from "@/domain/types";

export interface RadarPanelProps {
  circuit: Circuit;
  sessions: Session[];
}

export function RadarPanel(props: RadarPanelProps) {
  void props;
  return null;
}
