// Compares a source's view of a Series (after Schedule Overrides) with the published state and
// plans the writes. Pure: the sync applies the plan to the database.
//
// Rules:
// - New Rounds and Sessions are inserted (no Schedule Change).
// - A start time change must be seen by two checks in a row: the first sighting is stored as a
//   pending change; if the next check sees the same new time it is published with a Schedule Change.
//   If the source reverts, the pending change is dropped.
// - A Session is cancelled only when the source says so explicitly; that publishes immediately.
// - A Session that vanishes from the source is never deleted or pushed; it is flagged once.
// - Overridden Sessions take the Override's values. A changed Override publishes immediately.
// - Changes to a Session that has already started are applied without a Schedule Change (no push).
// - A fallback source only fills gaps: it can add new Rounds/Sessions (to Rounds without Sessions)
//   and apply explicit cancellations, but never moves published times or flags disappearances.
import type { Round, Session } from "@/domain/types";
import type { RoundWithSessions } from "./types";

export interface PendingChange {
  sessionId: string;
  observedStartsAt: string;
  observedEndsAt: string;
  seenCount: number;
}

export interface OpenFlag {
  id: number;
  sessionId: string | null;
  message: string;
}

export interface NewScheduleChange {
  sessionId: string;
  kind: "time" | "cancelled";
  previousStartsAt: string;
  newStartsAt: string | null;
}

export interface DiffInput {
  now: Date;
  source: string;
  isFallback: boolean;
  /** Source Rounds with Schedule Overrides applied. */
  incoming: RoundWithSessions[];
  overriddenSessionIds: Set<string>;
  /** Seasons the source listed completely (disappearance checks only run for these). */
  completeSeasons: number[];
  /** Problems found while parsing/normalising (unknown Circuit, unmapped Session). */
  problems: string[];
  existing: {
    rounds: Round[];
    sessions: Session[];
    pending: PendingChange[];
    openFlags: OpenFlag[];
  };
}

export interface SchedulePlan {
  roundInserts: Round[];
  roundUpdates: Round[];
  sessionInserts: Session[];
  /** Full new published state of each changed Session. */
  sessionUpdates: Session[];
  pendingUpserts: PendingChange[];
  pendingDeletes: string[];
  changes: NewScheduleChange[];
  flags: { sessionId: string | null; message: string }[];
  resolvedFlagIds: number[];
  log: string[];
}

export const DISAPPEARED_PREFIX = "Disappeared from source:";

const sameInstant = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

function roundChanged(a: Round, b: Round): boolean {
  return (
    a.name !== b.name ||
    a.circuitId !== b.circuitId ||
    a.startDate !== b.startDate ||
    a.endDate !== b.endDate ||
    a.sessionTimesConfirmed !== b.sessionTimesConfirmed ||
    a.season !== b.season ||
    a.slug !== b.slug
  );
}

function sessionChanged(a: Session, b: Session): boolean {
  return (
    !sameInstant(a.startsAt, b.startsAt) ||
    !sameInstant(a.endsAt, b.endsAt) ||
    a.endIsEstimated !== b.endIsEstimated ||
    a.status !== b.status ||
    a.name !== b.name ||
    a.type !== b.type
  );
}

export function emptyPlan(): SchedulePlan {
  return {
    roundInserts: [],
    roundUpdates: [],
    sessionInserts: [],
    sessionUpdates: [],
    pendingUpserts: [],
    pendingDeletes: [],
    changes: [],
    flags: [],
    resolvedFlagIds: [],
    log: [],
  };
}

export function planHasWrites(plan: SchedulePlan): boolean {
  return (
    plan.roundInserts.length +
      plan.roundUpdates.length +
      plan.sessionInserts.length +
      plan.sessionUpdates.length +
      plan.pendingUpserts.length +
      plan.pendingDeletes.length +
      plan.changes.length +
      plan.flags.length +
      plan.resolvedFlagIds.length >
    0
  );
}

/** True when the plan changes what viewers see (so pages must be revalidated). */
export function planChangesPublished(plan: SchedulePlan): boolean {
  return plan.roundInserts.length + plan.roundUpdates.length + plan.sessionInserts.length + plan.sessionUpdates.length > 0;
}

export function diffSchedule(input: DiffInput): SchedulePlan {
  const { now, existing, isFallback, overriddenSessionIds } = input;
  const plan = emptyPlan();
  const nowMs = now.getTime();

  const existingRounds = new Map(existing.rounds.map((r) => [r.id, r]));
  const existingSessions = new Map(existing.sessions.map((s) => [s.id, s]));
  const sessionsByRound = new Map<string, Session[]>();
  for (const s of existing.sessions) {
    sessionsByRound.set(s.roundId, [...(sessionsByRound.get(s.roundId) ?? []), s]);
  }
  const pending = new Map(existing.pending.map((p) => [p.sessionId, p]));
  const openMessages = new Set(existing.openFlags.map((f) => f.message));
  const incomingSessionIds = new Set<string>();
  const incomingRoundIds = new Set<string>();

  const flag = (sessionId: string | null, message: string) => {
    if (openMessages.has(message)) return;
    openMessages.add(message);
    plan.flags.push({ sessionId, message });
  };

  for (const problem of input.problems) flag(null, problem);

  for (const { round, sessions } of input.incoming) {
    incomingRoundIds.add(round.id);
    const known = existingRounds.get(round.id);
    const knownSessions = sessionsByRound.get(round.id) ?? [];

    if (!known) {
      plan.roundInserts.push(round);
      plan.log.push(`new Round ${round.id}`);
    } else if (roundChanged(known, round)) {
      // A fallback may only complete a Round whose Session times were not yet known.
      if (!isFallback || (!known.sessionTimesConfirmed && round.sessionTimesConfirmed)) plan.roundUpdates.push(round);
    }

    for (const incoming of sessions) {
      incomingSessionIds.add(incoming.id);
      const published = existingSessions.get(incoming.id);

      if (!published) {
        if (isFallback && knownSessions.length > 0) continue; // fallback ids may not match the primary's
        plan.sessionInserts.push(incoming);
        plan.log.push(`new Session ${incoming.id}`);
        continue;
      }

      const hasStarted = new Date(published.startsAt).getTime() <= nowMs;
      const pendingChange = pending.get(incoming.id);
      const dropPending = () => {
        if (pendingChange) plan.pendingDeletes.push(incoming.id);
      };

      // Schedule Override: published immediately, the source can't change it.
      if (overriddenSessionIds.has(incoming.id)) {
        dropPending();
        if (sessionChanged(published, incoming)) {
          plan.sessionUpdates.push(incoming);
          if (!hasStarted && incoming.status === "cancelled" && published.status !== "cancelled") {
            plan.changes.push({ sessionId: incoming.id, kind: "cancelled", previousStartsAt: published.startsAt, newStartsAt: null });
          } else if (!hasStarted && incoming.status === "scheduled" && !sameInstant(published.startsAt, incoming.startsAt)) {
            plan.changes.push({ sessionId: incoming.id, kind: "time", previousStartsAt: published.startsAt, newStartsAt: incoming.startsAt });
          }
          plan.log.push(`Schedule Override applied to ${incoming.id}`);
        }
        continue;
      }

      // Explicit cancellation: publish immediately.
      if (incoming.status === "cancelled" && published.status !== "cancelled") {
        dropPending();
        plan.sessionUpdates.push({ ...published, status: "cancelled" });
        if (!hasStarted) {
          plan.changes.push({ sessionId: incoming.id, kind: "cancelled", previousStartsAt: published.startsAt, newStartsAt: null });
        }
        plan.log.push(`Session ${incoming.id} cancelled by ${input.source}`);
        continue;
      }

      if (isFallback) continue; // fallbacks never move or edit published Sessions

      let next: Session = published;
      if (incoming.status === "scheduled" && published.status === "cancelled") {
        next = { ...next, status: "scheduled" };
        plan.log.push(`Session ${incoming.id} reinstated by ${input.source}`);
      }

      if (sameInstant(published.startsAt, incoming.startsAt)) {
        if (pendingChange) {
          plan.pendingDeletes.push(incoming.id);
          plan.log.push(`pending change for ${incoming.id} dropped: source reverted`);
        }
        // Silent refresh of the end time, name and type. A known end is never replaced by an estimate.
        const keepEnd = incoming.endIsEstimated && !published.endIsEstimated;
        next = {
          ...next,
          name: incoming.name,
          type: incoming.type,
          endsAt: keepEnd ? published.endsAt : incoming.endsAt,
          endIsEstimated: keepEnd ? published.endIsEstimated : incoming.endIsEstimated,
        };
      } else if (pendingChange && sameInstant(pendingChange.observedStartsAt, incoming.startsAt)) {
        // Second check in a row agrees: publish.
        plan.pendingDeletes.push(incoming.id);
        next = {
          ...next,
          name: incoming.name,
          type: incoming.type,
          startsAt: incoming.startsAt,
          endsAt: incoming.endsAt,
          endIsEstimated: incoming.endIsEstimated,
        };
        if (!hasStarted && next.status === "scheduled") {
          plan.changes.push({ sessionId: incoming.id, kind: "time", previousStartsAt: published.startsAt, newStartsAt: incoming.startsAt });
        }
        plan.log.push(`Session ${incoming.id} moved ${published.startsAt} → ${incoming.startsAt} (confirmed by two checks)`);
      } else {
        // First sighting (or a different new time than last check): wait for the next check.
        plan.pendingUpserts.push({
          sessionId: incoming.id,
          observedStartsAt: incoming.startsAt,
          observedEndsAt: incoming.endsAt,
          seenCount: 1,
        });
        plan.log.push(`Session ${incoming.id} may move ${published.startsAt} → ${incoming.startsAt}; waiting for a second check`);
      }

      if (sessionChanged(published, next)) plan.sessionUpdates.push(next);
    }
  }

  // Disappearances: flag once, never delete or push. Primary sources and complete seasons only.
  const complete = new Set(input.completeSeasons);
  if (!isFallback) {
    for (const flagRow of existing.openFlags) {
      if (flagRow.sessionId && flagRow.message.startsWith(DISAPPEARED_PREFIX) && incomingSessionIds.has(flagRow.sessionId)) {
        plan.resolvedFlagIds.push(flagRow.id);
      }
    }
    const openDisappeared = new Set(
      existing.openFlags.filter((f) => f.sessionId && f.message.startsWith(DISAPPEARED_PREFIX)).map((f) => f.sessionId),
    );
    for (const round of existing.rounds) {
      if (!complete.has(round.season)) continue;
      const roundSessions = sessionsByRound.get(round.id) ?? [];
      for (const s of roundSessions) {
        if (incomingSessionIds.has(s.id) || s.status === "cancelled") continue;
        if (new Date(s.endsAt).getTime() <= nowMs) continue;
        if (openDisappeared.has(s.id)) continue;
        flag(s.id, `${DISAPPEARED_PREFIX} Session ${s.id} ("${s.name}") is no longer listed by ${input.source}; kept as published`);
        plan.log.push(`LOUD: Session ${s.id} disappeared from ${input.source}`);
      }
      if (roundSessions.length === 0 && !incomingRoundIds.has(round.id) && round.endDate >= now.toISOString().slice(0, 10)) {
        const prefix = `${DISAPPEARED_PREFIX} Round ${round.id}`;
        if (![...openMessages].some((m) => m.startsWith(prefix))) {
          flag(null, `${prefix} ("${round.name}") is no longer listed by ${input.source}; kept as published`);
          plan.log.push(`LOUD: Round ${round.id} disappeared from ${input.source}`);
        }
      }
    }
  }

  return plan;
}
