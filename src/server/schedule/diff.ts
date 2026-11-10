// Compares a source's view of a Series (after Schedule Overrides) with the published state and
// plans the writes. Pure: the sync applies the plan to the database.
//
// Rules:
// - New Rounds and Sessions are inserted (no Schedule Change).
// - A start time change must be seen by two checks in a row: the first sighting is stored as a
//   pending change; if the next check sees the same new time it is published with a Schedule Change.
//   If the source reverts, the pending change is dropped.
// - A Session is cancelled only when the source says so explicitly, and like a time change only once two
//   checks in a row say so. A cancelled Session the source lists again is reinstated with a Schedule Change.
// - A Session that vanishes from the source is never deleted or pushed; it is flagged once. A new Session
//   id in the same Round with the same Session Type and start as a vanished one is the same Session
//   renamed: the stored Session takes the new id.
// - A source never turns a Round with published Sessions back to "Times TBC".
// - Flags are resolved once their cause is gone: the Session or Round is listed again or has ended, or a
//   complete primary check no longer finds the problem.
// - Overridden Sessions take the Override's values. A changed Override publishes immediately.
// - Changes to a Session that has already started are applied without a Schedule Change (no push).
// - A fallback source only fills gaps: it can add new Rounds/Sessions (to Rounds without Sessions)
//   and apply explicit cancellations, but never moves published times or flags disappearances.
import type { Round, ScheduleChangeKind, Session } from "@/domain/types";
import type { RoundWithSessions } from "./types";

export interface PendingChange {
  sessionId: string;
  observedStartsAt: string;
  observedEndsAt: string;
  seenCount: number;
  /** True when the source listed the Session as cancelled, rather than at a new time. */
  cancelled?: boolean;
}

export interface OpenFlag {
  id: number;
  sessionId: string | null;
  message: string;
}

export interface NewScheduleChange {
  sessionId: string;
  kind: ScheduleChangeKind;
  previousStartsAt: string;
  newStartsAt: string | null;
}

/** A stored Session that the source now lists under another id. */
export interface SessionRename {
  from: string;
  to: string;
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
  /** Applied before sessionUpdates, which then name the Session by its new id. */
  sessionRenames: SessionRename[];
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
const DISAPPEARED_ROUND = /^Disappeared from source: Round (\S+) /;

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
    sessionRenames: [],
    sessionUpdates: [],
    pendingUpserts: [],
    pendingDeletes: [],
    changes: [],
    flags: [],
    resolvedFlagIds: [],
    log: [],
  };
}

/** True when the plan changes what viewers see (so pages must be revalidated). */
export function planChangesPublished(plan: SchedulePlan): boolean {
  return (
    plan.roundInserts.length +
      plan.roundUpdates.length +
      plan.sessionInserts.length +
      plan.sessionRenames.length +
      plan.sessionUpdates.length >
    0
  );
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
  // Every id the source lists, so a rename never takes a stored Session that is still listed.
  const listedSessionIds = new Set(input.incoming.flatMap((r) => r.sessions.map((s) => s.id)));
  const renamedFrom = new Set<string>();

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
    } else {
      // A source that lists no Session times for a Round with published Sessions (a failed itinerary, a
      // finished rally's results) never hides them behind "Times TBC".
      const keepConfirmed = known.sessionTimesConfirmed && !round.sessionTimesConfirmed && knownSessions.length > 0;
      const next = keepConfirmed ? { ...round, sessionTimesConfirmed: true } : round;
      if (keepConfirmed) plan.log.push(`Round ${round.id} has no Session times in ${input.source}; kept as confirmed`);
      // A fallback may only complete a Round whose Session times were not yet known.
      if (roundChanged(known, next) && (!isFallback || (!known.sessionTimesConfirmed && next.sessionTimesConfirmed))) {
        plan.roundUpdates.push(next);
      }
    }

    for (const incoming of sessions) {
      incomingSessionIds.add(incoming.id);
      let published = existingSessions.get(incoming.id);

      // A renamed Session (a relabelled or renumbered entry): carry the stored one over to the new id.
      if (!published && !isFallback) {
        const old = knownSessions.find(
          (s) =>
            !renamedFrom.has(s.id) &&
            !listedSessionIds.has(s.id) &&
            s.type === incoming.type &&
            sameInstant(s.startsAt, incoming.startsAt),
        );
        if (old) {
          renamedFrom.add(old.id);
          plan.sessionRenames.push({ from: old.id, to: incoming.id });
          plan.log.push(`Session ${old.id} renamed to ${incoming.id} by ${input.source}`);
          published = { ...old, id: incoming.id };
        }
      }

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

      // Explicit cancellation: like a time change, published once two checks in a row agree.
      if (incoming.status === "cancelled" && published.status !== "cancelled") {
        if (!pendingChange?.cancelled) {
          plan.pendingUpserts.push({
            sessionId: incoming.id,
            observedStartsAt: incoming.startsAt,
            observedEndsAt: incoming.endsAt,
            seenCount: 1,
            cancelled: true,
          });
          plan.log.push(`Session ${incoming.id} may be cancelled by ${input.source}; waiting for a second check`);
          continue;
        }
        dropPending();
        plan.sessionUpdates.push({ ...published, status: "cancelled" });
        if (!hasStarted) {
          plan.changes.push({ sessionId: incoming.id, kind: "cancelled", previousStartsAt: published.startsAt, newStartsAt: null });
        }
        plan.log.push(`Session ${incoming.id} cancelled by ${input.source} (confirmed by two checks)`);
        continue;
      }

      if (isFallback) continue; // fallbacks never move or edit published Sessions

      let next: Session = published;
      const reinstated = incoming.status === "scheduled" && published.status === "cancelled";
      if (reinstated) {
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
      } else if (pendingChange && !pendingChange.cancelled && sameInstant(pendingChange.observedStartsAt, incoming.startsAt)) {
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
        // A reinstatement's Schedule Change (below) already gives the new time.
        if (!hasStarted && next.status === "scheduled" && !reinstated) {
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

      if (reinstated && !hasStarted) {
        plan.changes.push({ sessionId: incoming.id, kind: "reinstated", previousStartsAt: published.startsAt, newStartsAt: next.startsAt });
      }
      if (sessionChanged(published, next)) plan.sessionUpdates.push(next);
    }
  }

  // A pending change can only be confirmed by a check that lists its Session. One whose Session has left
  // the primary source (a finished WRC rally's itinerary, say) is dropped, or every check 10 minutes later
  // would be due for ever. A fallback lists a different set of Sessions, so it never drops one.
  if (!isFallback) {
    const dropped = new Set(plan.pendingDeletes);
    for (const p of existing.pending) {
      if (incomingSessionIds.has(p.sessionId) || dropped.has(p.sessionId)) continue;
      dropped.add(p.sessionId);
      plan.pendingDeletes.push(p.sessionId);
      plan.log.push(`pending change for ${p.sessionId} dropped: Session no longer listed by ${input.source}`);
    }
  }

  // Flags whose cause is gone are resolved. A Session or Round listed again only counts from the primary
  // source (a fallback's ids may not match); one that has ended counts on any check. A problem is resolved
  // when a primary check that listed every season completely no longer finds it.
  const complete = new Set(input.completeSeasons);
  const today = now.toISOString().slice(0, 10);
  const problems = new Set(input.problems);
  const readCompletely =
    !isFallback && complete.size > 0 && input.incoming.every(({ round }) => complete.has(round.season));
  for (const flagRow of existing.openFlags) {
    let gone: boolean;
    if (flagRow.message.startsWith(DISAPPEARED_PREFIX) && flagRow.sessionId) {
      const s = existingSessions.get(flagRow.sessionId);
      const listedAgain = !isFallback && (incomingSessionIds.has(flagRow.sessionId) || renamedFrom.has(flagRow.sessionId));
      gone = listedAgain || !s || new Date(s.endsAt).getTime() <= nowMs;
    } else if (flagRow.message.startsWith(DISAPPEARED_PREFIX)) {
      const roundId = DISAPPEARED_ROUND.exec(flagRow.message)?.[1];
      const r = roundId ? existingRounds.get(roundId) : undefined;
      gone = !!roundId && ((!isFallback && incomingRoundIds.has(roundId)) || !r || r.endDate < today);
    } else {
      gone = readCompletely && !flagRow.sessionId && !problems.has(flagRow.message);
    }
    if (gone) plan.resolvedFlagIds.push(flagRow.id);
  }

  // Disappearances: flag once, never delete or push. Primary sources and complete seasons only.
  if (!isFallback) {
    const openDisappeared = new Set(
      existing.openFlags.filter((f) => f.sessionId && f.message.startsWith(DISAPPEARED_PREFIX)).map((f) => f.sessionId),
    );
    for (const round of existing.rounds) {
      if (!complete.has(round.season)) continue;
      const roundSessions = sessionsByRound.get(round.id) ?? [];
      for (const s of roundSessions) {
        if (incomingSessionIds.has(s.id) || renamedFrom.has(s.id) || s.status === "cancelled") continue;
        if (new Date(s.endsAt).getTime() <= nowMs) continue;
        if (openDisappeared.has(s.id)) continue;
        flag(s.id, `${DISAPPEARED_PREFIX} Session ${s.id} ("${s.name}") is no longer listed by ${input.source}; kept as published`);
        plan.log.push(`LOUD: Session ${s.id} disappeared from ${input.source}`);
      }
      if (roundSessions.length === 0 && !incomingRoundIds.has(round.id) && round.endDate >= today) {
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
