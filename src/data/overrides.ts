// Schedule Overrides: hand-made corrections to a Session's time or status.
// Applied after source parsing and before diffing; each takes precedence over the source until removed.
// While an Override is in place the source cannot change that Session. An Override that moves a
// Session's start or cancels it is published straight away (it is human-checked) as a Schedule Change.
import type { SessionStatus } from "@/domain/types";

export interface ScheduleOverride {
  /** Session id, e.g. "f1-2026-las-vegas:qualifying". */
  sessionId: string;
  /** ISO 8601 UTC. If only startsAt is given, the Session keeps its length. */
  startsAt?: string;
  /** ISO 8601 UTC. */
  endsAt?: string;
  status?: SessionStatus;
  /** Why the Override exists and where the correct information came from. */
  reason: string;
}

export const SCHEDULE_OVERRIDES: ScheduleOverride[] = [
  // Example:
  // {
  //   sessionId: "f2-2026-lusail:feature-race",
  //   startsAt: "2026-11-29T09:25:00Z",
  //   endsAt: "2026-11-29T10:30:00Z",
  //   reason: "Times announced on fiaformula2.com news before the Round page updated",
  // },
];
