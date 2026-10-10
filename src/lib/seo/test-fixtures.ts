// Test fixtures for the SEO builders: the 2026 F1 Singapore Grand Prix (Track Time is UTC+8).
import type { Circuit, Round, Session } from "@/domain/types";

export const singapore: Circuit = {
  id: "marina-bay",
  name: "Marina Bay Street Circuit",
  location: "Marina Bay, Singapore",
  lat: 1.2914,
  lon: 103.864,
  timeZone: "Asia/Singapore",
  hasRadarCoverage: true,
};

export const singaporeRound: Round = {
  id: "f1-2026-singapore",
  series: "f1",
  season: 2026,
  slug: "singapore",
  name: "Singapore Grand Prix",
  circuitId: "marina-bay",
  startDate: "2026-10-09",
  endDate: "2026-10-11",
  sessionTimesConfirmed: true,
};

function session(slug: string, name: string, type: Session["type"], startsAt: string, endsAt: string, status: Session["status"] = "scheduled"): Session {
  return { id: `f1-2026-singapore:${slug}`, roundId: "f1-2026-singapore", series: "f1", type, name, startsAt, endsAt, endIsEstimated: false, status };
}

export const singaporeSessions: Session[] = [
  session("fp1", "Free Practice 1", "practice", "2026-10-09T09:30:00Z", "2026-10-09T10:30:00Z"),
  session("fp2", "Free Practice 2", "practice", "2026-10-09T13:00:00Z", "2026-10-09T14:00:00Z"),
  session("fp3", "Free Practice 3", "practice", "2026-10-10T09:30:00Z", "2026-10-10T10:30:00Z"),
  session("qualifying", "Qualifying", "qualifying", "2026-10-10T13:00:00Z", "2026-10-10T14:00:00Z"),
  session("race", "Race", "race", "2026-10-11T12:00:00Z", "2026-10-11T14:00:00Z"),
];
