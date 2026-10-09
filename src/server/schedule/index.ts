// CONTRACT — owned by the schedule-data work. UI code imports only from here.
// This stub returns fixed sample data until the real implementation lands.
import type { Circuit, FeaturedRoundResult, SeriesId } from "@/domain/types";

const sampleCircuit: Circuit = {
  id: "las-vegas",
  name: "Las Vegas Strip Circuit",
  location: "Las Vegas, United States",
  lat: 36.1147,
  lon: -115.1728,
  timeZone: "America/Los_Angeles",
  hasRadarCoverage: true,
};

/** The Round a Series page shows: in progress, else next upcoming; held for 2h after its final Session. */
export async function getFeaturedRound(series: SeriesId, now: Date = new Date()): Promise<FeaturedRoundResult> {
  void now;
  const roundId = `${series}-2026-las-vegas`;
  const s = (slug: string, name: string, type: "practice" | "qualifying" | "race", start: string, end: string) => ({
    id: `${roundId}:${slug}`,
    roundId,
    series,
    type,
    name,
    startsAt: start,
    endsAt: end,
    endIsEstimated: false,
    status: "scheduled" as const,
  });
  return {
    kind: "round",
    round: {
      id: roundId,
      series,
      season: 2026,
      slug: "las-vegas",
      name: "Las Vegas Grand Prix",
      circuitId: sampleCircuit.id,
      startDate: "2026-11-19",
      endDate: "2026-11-21",
      sessionTimesConfirmed: true,
    },
    circuit: sampleCircuit,
    sessions: [
      s("fp1", "Free Practice 1", "practice", "2026-11-20T00:30:00Z", "2026-11-20T01:30:00Z"),
      s("fp2", "Free Practice 2", "practice", "2026-11-20T04:00:00Z", "2026-11-20T05:00:00Z"),
      s("fp3", "Free Practice 3", "practice", "2026-11-21T00:30:00Z", "2026-11-21T01:30:00Z"),
      s("qualifying", "Qualifying", "qualifying", "2026-11-21T04:00:00Z", "2026-11-21T05:00:00Z"),
      s("race", "Race", "race", "2026-11-22T04:00:00Z", "2026-11-22T06:00:00Z"),
    ],
  };
}
