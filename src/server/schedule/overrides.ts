// Applies Schedule Overrides to normalised source data (after parsing, before diffing).
import type { ScheduleOverride } from "@/data/overrides";
import type { RoundWithSessions } from "./types";
import { toIso } from "./time";

export function applyOverrides(
  rounds: RoundWithSessions[],
  overrides: ScheduleOverride[],
): { rounds: RoundWithSessions[]; overriddenSessionIds: Set<string>; warnings: string[] } {
  const byId = new Map(overrides.map((o) => [o.sessionId, o]));
  const overriddenSessionIds = new Set<string>();
  const result = rounds.map(({ round, sessions }) => ({
    round,
    sessions: sessions
      .map((session) => {
        const o = byId.get(session.id);
        if (!o) return session;
        overriddenSessionIds.add(session.id);
        const startsAt = toIso(o.startsAt) ?? session.startsAt;
        const shift = new Date(startsAt).getTime() - new Date(session.startsAt).getTime();
        const endsAt = toIso(o.endsAt) ?? new Date(new Date(session.endsAt).getTime() + shift).toISOString();
        return {
          ...session,
          startsAt,
          endsAt,
          endIsEstimated: o.endsAt ? false : session.endIsEstimated,
          status: o.status ?? session.status,
        };
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  }));
  const warnings = overrides
    .filter((o) => !overriddenSessionIds.has(o.sessionId))
    .map((o) => `Schedule Override for ${o.sessionId} matches no Session in the source; not applied`);
  return { rounds: result, overriddenSessionIds, warnings };
}
