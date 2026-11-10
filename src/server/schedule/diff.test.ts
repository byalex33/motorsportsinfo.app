import { describe, expect, it } from "vitest";
import type { Round, Session } from "@/domain/types";
import { DISAPPEARED_PREFIX, diffSchedule, planChangesPublished, type DiffInput, type OpenFlag, type PendingChange } from "./diff";
import { applyOverrides } from "./overrides";
import { makeRound, makeSession } from "./test-utils";

const NOW = new Date("2026-10-01T12:00:00Z");
const round = makeRound("f1-2026-cota", "cota", "2026-10-23", "2026-10-25");
const fp1 = makeSession(round.id, "practice-1", "2026-10-23T17:30:00Z");
const race = makeSession(round.id, "race", "2026-10-25T20:00:00Z", { type: "race", endsAt: "2026-10-25T22:00:00.000Z" });

function input(
  incoming: Session[],
  opts: {
    published?: Session[];
    rounds?: Round[];
    pending?: PendingChange[];
    flags?: OpenFlag[];
    isFallback?: boolean;
    overridden?: string[];
    now?: Date;
    problems?: string[];
    incomingRound?: Round;
  } = {},
): DiffInput {
  return {
    now: opts.now ?? NOW,
    source: "openf1",
    isFallback: opts.isFallback ?? false,
    incoming: [{ round: opts.incomingRound ?? round, sessions: incoming }],
    overriddenSessionIds: new Set(opts.overridden ?? []),
    completeSeasons: [2026],
    problems: opts.problems ?? [],
    existing: {
      rounds: opts.rounds ?? [round],
      sessions: opts.published ?? [fp1, race],
      pending: opts.pending ?? [],
      openFlags: opts.flags ?? [],
    },
  };
}

const moved = (s: Session, startsAt: string): Session => {
  const shift = new Date(startsAt).getTime() - new Date(s.startsAt).getTime();
  return { ...s, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(new Date(s.endsAt).getTime() + shift).toISOString() };
};

describe("diffSchedule", () => {
  it("does nothing when the source matches the published state", () => {
    const plan = diffSchedule(input([fp1, race]));
    expect(planChangesPublished(plan)).toBe(false);
    expect(plan.pendingUpserts).toEqual([]);
    expect(plan.changes).toEqual([]);
    expect(plan.flags).toEqual([]);
  });

  it("inserts new Rounds and Sessions without a Schedule Change", () => {
    const plan = diffSchedule(input([fp1, race], { published: [], rounds: [] }));
    expect(plan.roundInserts.map((r) => r.id)).toEqual([round.id]);
    expect(plan.sessionInserts.map((s) => s.id)).toEqual([fp1.id, race.id]);
    expect(plan.changes).toEqual([]);
  });

  describe("two-check rule for time changes", () => {
    const newRace = moved(race, "2026-10-25T19:00:00Z");

    it("holds the first sighting as pending and publishes nothing", () => {
      const plan = diffSchedule(input([fp1, newRace]));
      expect(plan.pendingUpserts).toEqual([
        { sessionId: race.id, observedStartsAt: newRace.startsAt, observedEndsAt: newRace.endsAt, seenCount: 1 },
      ]);
      expect(plan.sessionUpdates).toEqual([]);
      expect(plan.changes).toEqual([]);
    });

    it("publishes when the next check sees the same new time", () => {
      const pending = [{ sessionId: race.id, observedStartsAt: newRace.startsAt, observedEndsAt: newRace.endsAt, seenCount: 1 }];
      const plan = diffSchedule(input([fp1, newRace], { pending }));
      expect(plan.sessionUpdates).toEqual([newRace]);
      expect(plan.changes).toEqual([
        { sessionId: race.id, kind: "time", previousStartsAt: race.startsAt, newStartsAt: newRace.startsAt },
      ]);
      expect(plan.pendingDeletes).toEqual([race.id]);
      expect(plan.pendingUpserts).toEqual([]);
    });

    it("restarts the count when the next check sees a different new time", () => {
      const pending = [{ sessionId: race.id, observedStartsAt: "2026-10-25T18:00:00.000Z", observedEndsAt: "x", seenCount: 1 }];
      const plan = diffSchedule(input([fp1, newRace], { pending }));
      expect(plan.pendingUpserts).toMatchObject([{ sessionId: race.id, observedStartsAt: newRace.startsAt, seenCount: 1 }]);
      expect(plan.changes).toEqual([]);
      expect(plan.sessionUpdates).toEqual([]);
    });

    it("drops the pending change when the source reverts", () => {
      const pending = [{ sessionId: race.id, observedStartsAt: newRace.startsAt, observedEndsAt: newRace.endsAt, seenCount: 1 }];
      const plan = diffSchedule(input([fp1, race], { pending }));
      expect(plan.pendingDeletes).toEqual([race.id]);
      expect(plan.sessionUpdates).toEqual([]);
      expect(plan.changes).toEqual([]);
    });

    it("drops a pending change whose Session the primary source no longer lists", () => {
      const pending = [{ sessionId: race.id, observedStartsAt: newRace.startsAt, observedEndsAt: newRace.endsAt, seenCount: 1 }];
      // A finished WRC rally, say: the Round comes back with no Sessions.
      const plan = diffSchedule(input([], { pending }));
      expect(plan.pendingDeletes).toEqual([race.id]);
      expect(plan.pendingUpserts).toEqual([]);
      expect(plan.sessionUpdates).toEqual([]);
      expect(plan.changes).toEqual([]);
      expect(plan.log).toContain(`pending change for ${race.id} dropped: Session no longer listed by openf1`);
    });

    it("drops each pending change once, also when the Round is no longer listed", () => {
      const pending = [
        { sessionId: race.id, observedStartsAt: newRace.startsAt, observedEndsAt: newRace.endsAt, seenCount: 1 },
        { sessionId: fp1.id, observedStartsAt: "2026-10-23T18:30:00.000Z", observedEndsAt: "2026-10-23T19:30:00.000Z", seenCount: 1 },
      ];
      // fp1 is listed and back at its published time (dropped in the loop); race is gone.
      expect(diffSchedule(input([fp1], { pending })).pendingDeletes).toEqual([fp1.id, race.id]);
      const noRound = diffSchedule({ ...input([], { pending }), incoming: [] });
      expect(noRound.pendingDeletes).toEqual([race.id, fp1.id]);
    });

    it("compares instants, not strings", () => {
      const plan = diffSchedule(input([fp1, { ...race, startsAt: "2026-10-25T20:00:00Z" }]));
      expect(plan.pendingUpserts).toEqual([]);
    });

    it("applies a confirmed move of a Session that has already started without a Schedule Change", () => {
      const now = new Date("2026-10-25T20:30:00Z");
      const late = moved(race, "2026-10-25T20:45:00Z");
      const pending = [{ sessionId: race.id, observedStartsAt: late.startsAt, observedEndsAt: late.endsAt, seenCount: 1 }];
      const plan = diffSchedule(input([fp1, late], { pending, now }));
      expect(plan.sessionUpdates).toEqual([late]);
      expect(plan.changes).toEqual([]);
    });
  });

  describe("two-check rule for cancellations", () => {
    const cancelledRace = { ...race, status: "cancelled" as const };
    const pendingCancel = { sessionId: race.id, observedStartsAt: race.startsAt, observedEndsAt: race.endsAt, seenCount: 1, cancelled: true };

    it("holds the first sighting of a cancellation as pending and publishes nothing", () => {
      const plan = diffSchedule(input([fp1, cancelledRace]));
      expect(plan.pendingUpserts).toEqual([pendingCancel]);
      expect(plan.sessionUpdates).toEqual([]);
      expect(plan.changes).toEqual([]);
    });

    it("publishes the cancellation when the next check sees it too", () => {
      const plan = diffSchedule(input([fp1, cancelledRace], { pending: [pendingCancel] }));
      expect(plan.sessionUpdates).toEqual([cancelledRace]);
      expect(plan.changes).toEqual([{ sessionId: race.id, kind: "cancelled", previousStartsAt: race.startsAt, newStartsAt: null }]);
      expect(plan.pendingDeletes).toEqual([race.id]);
      expect(plan.pendingUpserts).toEqual([]);
    });

    it("drops the pending cancellation when the source lists the Session as scheduled again", () => {
      const plan = diffSchedule(input([fp1, race], { pending: [pendingCancel] }));
      expect(plan.pendingDeletes).toEqual([race.id]);
      expect(plan.sessionUpdates).toEqual([]);
      expect(plan.changes).toEqual([]);
    });

    it("does not publish a move on the strength of a pending cancellation", () => {
      const newRace = moved(race, "2026-10-25T19:00:00Z");
      const plan = diffSchedule(input([fp1, newRace], { pending: [{ ...pendingCancel, observedStartsAt: newRace.startsAt }] }));
      expect(plan.sessionUpdates).toEqual([]);
      expect(plan.changes).toEqual([]);
      expect(plan.pendingUpserts).toEqual([
        { sessionId: race.id, observedStartsAt: newRace.startsAt, observedEndsAt: newRace.endsAt, seenCount: 1 },
      ]);
    });

    it("does not publish a cancellation on the strength of a pending move", () => {
      const pending = [{ sessionId: race.id, observedStartsAt: race.startsAt, observedEndsAt: race.endsAt, seenCount: 1 }];
      const plan = diffSchedule(input([fp1, cancelledRace], { pending }));
      expect(plan.changes).toEqual([]);
      expect(plan.pendingUpserts).toEqual([pendingCancel]);
    });
  });

  it("does not re-announce an already cancelled Session", () => {
    const cancelled = { ...race, status: "cancelled" as const };
    const plan = diffSchedule(input([fp1, cancelled], { published: [fp1, cancelled] }));
    expect(plan.changes).toEqual([]);
    expect(plan.sessionUpdates).toEqual([]);
  });

  describe("reinstatement", () => {
    const cancelled = { ...race, status: "cancelled" as const };

    it("publishes a reinstated Session with a Schedule Change", () => {
      const plan = diffSchedule(input([fp1, race], { published: [fp1, cancelled] }));
      expect(plan.sessionUpdates).toEqual([race]);
      expect(plan.changes).toEqual([{ sessionId: race.id, kind: "reinstated", previousStartsAt: race.startsAt, newStartsAt: race.startsAt }]);
    });

    it("gives one Schedule Change when a reinstated Session's move is confirmed at the same time", () => {
      const newRace = moved(race, "2026-10-25T19:00:00Z");
      const pending = [{ sessionId: race.id, observedStartsAt: newRace.startsAt, observedEndsAt: newRace.endsAt, seenCount: 1 }];
      const plan = diffSchedule(input([fp1, newRace], { published: [fp1, cancelled], pending }));
      expect(plan.sessionUpdates).toEqual([newRace]);
      expect(plan.changes).toEqual([
        { sessionId: race.id, kind: "reinstated", previousStartsAt: race.startsAt, newStartsAt: newRace.startsAt },
      ]);
    });

    it("tells nobody about a Session reinstated after it started", () => {
      const plan = diffSchedule(input([fp1, race], { published: [fp1, cancelled], now: new Date("2026-10-25T20:30:00Z") }));
      expect(plan.sessionUpdates).toEqual([race]);
      expect(plan.changes).toEqual([]);
    });
  });

  describe("Session renames", () => {
    const quali = makeSession(round.id, "qualifying", "2026-10-24T21:00:00Z", { type: "qualifying" });
    const quali1 = { ...makeSession(round.id, "qualifying-1", "2026-10-24T21:00:00Z", { type: "qualifying" }), name: "Qualifying 1" };
    const quali2 = makeSession(round.id, "qualifying-2", "2026-10-24T22:00:00Z", { type: "qualifying" });

    it("carries the stored Session over to its new id instead of adding a duplicate", () => {
      const plan = diffSchedule(input([fp1, quali1, quali2, race], { published: [fp1, quali, race] }));
      expect(plan.sessionRenames).toEqual([{ from: quali.id, to: quali1.id }]);
      expect(plan.sessionInserts.map((s) => s.id)).toEqual([quali2.id]);
      expect(plan.sessionUpdates).toEqual([{ ...quali, id: quali1.id, name: "Qualifying 1" }]);
      expect(plan.flags).toEqual([]);
      expect(planChangesPublished(plan)).toBe(true);
    });

    it("resolves an open disappearance flag of the old id", () => {
      const flags = [{ id: 3, sessionId: quali.id, message: `${DISAPPEARED_PREFIX} Session ${quali.id}` }];
      const plan = diffSchedule(input([fp1, quali1, race], { published: [fp1, quali, race], flags }));
      expect(plan.resolvedFlagIds).toEqual([3]);
    });

    it("needs the same Session Type and start, and the old id gone from the source", () => {
      const otherType = { ...quali1, type: "race" as const };
      expect(diffSchedule(input([fp1, otherType, race], { published: [fp1, quali, race] })).sessionRenames).toEqual([]);
      const otherStart = moved(quali1, "2026-10-24T21:30:00Z");
      expect(diffSchedule(input([fp1, otherStart, race], { published: [fp1, quali, race] })).sessionRenames).toEqual([]);
      const stillListed = diffSchedule(input([fp1, quali, quali1, race], { published: [fp1, quali, race] }));
      expect(stillListed.sessionRenames).toEqual([]);
      expect(stillListed.sessionInserts.map((s) => s.id)).toEqual([quali1.id]);
    });

    it("never comes from a fallback source", () => {
      const plan = diffSchedule(input([fp1, quali1, race], { published: [fp1, quali, race], isFallback: true }));
      expect(plan.sessionRenames).toEqual([]);
    });
  });

  describe("Session times confirmed", () => {
    it("is never cleared by a source while the Round has published Sessions", () => {
      const tbc = { ...round, sessionTimesConfirmed: false };
      const plan = diffSchedule(input([], { incomingRound: tbc }));
      expect(plan.roundUpdates).toEqual([]);
      const renamed = diffSchedule(input([], { incomingRound: { ...tbc, name: "United States Grand Prix" } }));
      expect(renamed.roundUpdates).toEqual([{ ...round, name: "United States Grand Prix" }]);
    });

    it("can be cleared for a Round without Sessions", () => {
      const tbc = { ...round, sessionTimesConfirmed: false };
      expect(diffSchedule(input([], { incomingRound: tbc, published: [] })).roundUpdates).toEqual([tbc]);
    });
  });

  describe("disappearance", () => {
    it("flags a vanished Session once and never deletes or pushes it", () => {
      const plan = diffSchedule(input([race]));
      expect(plan.flags).toHaveLength(1);
      expect(plan.flags[0].sessionId).toBe(fp1.id);
      expect(plan.flags[0].message.startsWith(DISAPPEARED_PREFIX)).toBe(true);
      expect(plan.sessionUpdates).toEqual([]);
      expect(plan.changes).toEqual([]);

      const again = diffSchedule(input([race], { flags: [{ id: 7, sessionId: fp1.id, message: plan.flags[0].message }] }));
      expect(again.flags).toEqual([]);
    });

    it("resolves the flag when the Session reappears", () => {
      const flags = [{ id: 7, sessionId: fp1.id, message: `${DISAPPEARED_PREFIX} Session ${fp1.id}` }];
      expect(diffSchedule(input([fp1, race], { flags })).resolvedFlagIds).toEqual([7]);
    });

    it("ignores Sessions that already ended, and seasons the source didn't list completely", () => {
      const past = makeSession(round.id, "old", "2026-09-01T10:00:00Z");
      expect(diffSchedule(input([fp1, race], { published: [past, fp1, race] })).flags).toEqual([]);
      const partial = { ...input([race]), completeSeasons: [] };
      expect(diffSchedule(partial).flags).toEqual([]);
    });

    it("flags a vanished Round that has no Sessions", () => {
      const tbc = makeRound("f1-2026-lusail", "lusail", "2026-11-27", "2026-11-29", { sessionTimesConfirmed: false });
      const plan = diffSchedule(input([fp1, race], { rounds: [round, tbc] }));
      expect(plan.flags).toHaveLength(1);
      expect(plan.flags[0]).toMatchObject({ sessionId: null });
      expect(plan.flags[0].message).toContain("f1-2026-lusail");
    });

    it("resolves a Session's flag once the Session has ended", () => {
      const flags = [{ id: 8, sessionId: fp1.id, message: `${DISAPPEARED_PREFIX} Session ${fp1.id} ("practice-1")` }];
      const after = new Date("2026-10-23T19:00:00Z");
      expect(diffSchedule(input([race], { flags, now: after })).resolvedFlagIds).toEqual([8]);
      expect(diffSchedule(input([race], { flags })).resolvedFlagIds).toEqual([]);
      // Ending is a fact of the clock, so a fallback check resolves it too.
      expect(diffSchedule(input([race], { flags, now: after, isFallback: true })).resolvedFlagIds).toEqual([8]);
    });

    it("resolves a Round's flag once the Round has ended or is listed again", () => {
      const tbc = makeRound("f1-2026-lusail", "lusail", "2026-11-27", "2026-11-29", { sessionTimesConfirmed: false });
      const flags = [{ id: 9, sessionId: null, message: `${DISAPPEARED_PREFIX} Round ${tbc.id} ("${tbc.name}") is no longer listed by openf1; kept as published` }];
      const rounds = [round, tbc];
      expect(diffSchedule(input([fp1, race], { rounds, flags })).resolvedFlagIds).toEqual([]);
      expect(diffSchedule(input([fp1, race], { rounds, flags, now: new Date("2026-11-30T12:00:00Z") })).resolvedFlagIds).toEqual([9]);
      const listed = { ...input([fp1, race], { rounds, flags }) };
      listed.incoming = [...listed.incoming, { round: tbc, sessions: [] }];
      expect(diffSchedule(listed).resolvedFlagIds).toEqual([9]);
    });
  });

  it("records source problems as flags once", () => {
    const problem = 'Unknown Circuit for F1 2026 "X Grand Prix"';
    expect(diffSchedule(input([fp1, race], { problems: [problem] })).flags).toEqual([{ sessionId: null, message: problem }]);
    expect(diffSchedule(input([fp1, race], { problems: [problem], flags: [{ id: 1, sessionId: null, message: problem }] })).flags).toEqual([]);
  });

  describe("resolving problem flags", () => {
    const problem = 'Unknown Circuit for F1 2026 "X Grand Prix"';
    const flags = [{ id: 1, sessionId: null, message: problem }];

    it("resolves a problem the next complete primary check no longer finds", () => {
      expect(diffSchedule(input([fp1, race], { flags })).resolvedFlagIds).toEqual([1]);
      expect(diffSchedule(input([fp1, race], { flags, problems: [problem] })).resolvedFlagIds).toEqual([]);
    });

    it("keeps it on a fallback check or a check that did not list every season completely", () => {
      expect(diffSchedule(input([fp1, race], { flags, isFallback: true })).resolvedFlagIds).toEqual([]);
      expect(diffSchedule({ ...input([fp1, race], { flags }), completeSeasons: [] }).resolvedFlagIds).toEqual([]);
      const nextSeason = makeRound("f1-2027-cota", "cota", "2027-10-22", "2027-10-24");
      const partial = input([fp1, race], { flags });
      partial.incoming = [...partial.incoming, { round: nextSeason, sessions: [] }];
      expect(diffSchedule(partial).resolvedFlagIds).toEqual([]);
    });
  });

  describe("Schedule Overrides", () => {
    const override = { sessionId: race.id, startsAt: "2026-10-25T21:00:00Z", reason: "test" };

    it("publishes an Override immediately (no two-check) with a Schedule Change", () => {
      const applied = applyOverrides([{ round, sessions: [fp1, race] }], [override]);
      const plan = diffSchedule({ ...input(applied.rounds[0].sessions, {}), overriddenSessionIds: applied.overriddenSessionIds });
      expect(plan.sessionUpdates).toMatchObject([{ id: race.id, startsAt: "2026-10-25T21:00:00.000Z", endsAt: "2026-10-25T23:00:00.000Z" }]);
      expect(plan.changes).toEqual([
        { sessionId: race.id, kind: "time", previousStartsAt: race.startsAt, newStartsAt: "2026-10-25T21:00:00.000Z" },
      ]);
      expect(plan.pendingUpserts).toEqual([]);
    });

    it("takes precedence: the source can't move an overridden Session", () => {
      const published = { ...race, startsAt: "2026-10-25T21:00:00.000Z", endsAt: "2026-10-25T23:00:00.000Z" };
      const sourceSays = moved(race, "2026-10-25T18:00:00Z");
      const applied = applyOverrides([{ round, sessions: [fp1, sourceSays] }], [override]);
      const pending = [{ sessionId: race.id, observedStartsAt: sourceSays.startsAt, observedEndsAt: sourceSays.endsAt, seenCount: 1 }];
      const plan = diffSchedule({
        ...input(applied.rounds[0].sessions, { published: [fp1, published], pending }),
        overriddenSessionIds: applied.overriddenSessionIds,
      });
      expect(plan.sessionUpdates).toEqual([]);
      expect(plan.changes).toEqual([]);
      expect(plan.pendingUpserts).toEqual([]);
      expect(plan.pendingDeletes).toEqual([race.id]);
    });

    it("can cancel a Session", () => {
      const applied = applyOverrides([{ round, sessions: [fp1, race] }], [{ sessionId: fp1.id, status: "cancelled", reason: "test" }]);
      const plan = diffSchedule({ ...input(applied.rounds[0].sessions), overriddenSessionIds: applied.overriddenSessionIds });
      expect(plan.changes).toEqual([{ sessionId: fp1.id, kind: "cancelled", previousStartsAt: fp1.startsAt, newStartsAt: null }]);
    });
  });

  describe("fallback sources", () => {
    it("never move published times, drop pending changes or flag disappearances", () => {
      const pending = [{ sessionId: race.id, observedStartsAt: "2026-10-25T19:00:00.000Z", observedEndsAt: "x", seenCount: 1 }];
      const plan = diffSchedule(input([moved(race, "2026-10-25T19:00:00Z")], { isFallback: true, pending }));
      expect(plan.pendingUpserts).toEqual([]);
      expect(plan.pendingDeletes).toEqual([]);
      expect(plan.sessionUpdates).toEqual([]);
      expect(plan.changes).toEqual([]);
      expect(plan.flags).toEqual([]);
    });

    it("keep a pending change whose Session they don't list", () => {
      const pending = [{ sessionId: race.id, observedStartsAt: "2026-10-25T19:00:00.000Z", observedEndsAt: "x", seenCount: 1 }];
      const plan = diffSchedule(input([], { isFallback: true, pending }));
      expect(plan.pendingDeletes).toEqual([]);
    });

    it("never replace a known end time with an estimate (primary either)", () => {
      const estimated = { ...race, endsAt: "2026-10-25T22:30:00.000Z", endIsEstimated: true };
      expect(diffSchedule(input([fp1, estimated])).sessionUpdates).toEqual([]);
    });

    it("fill gaps: Sessions for a Round that had none, and new Rounds", () => {
      const tbc = { ...round, sessionTimesConfirmed: false };
      const plan = diffSchedule(input([fp1, race], { isFallback: true, published: [], rounds: [tbc] }));
      expect(plan.roundUpdates).toEqual([round]);
      expect(plan.sessionInserts.map((s) => s.id)).toEqual([fp1.id, race.id]);
    });

    it("don't add differently named Sessions to a Round that already has Sessions", () => {
      const extra = makeSession(round.id, "feature-race", "2026-10-25T20:00:00Z");
      const plan = diffSchedule(input([fp1, race, extra], { isFallback: true }));
      expect(plan.sessionInserts).toEqual([]);
    });

    it("still apply explicit cancellations, after two checks", () => {
      const cancelled = { ...race, status: "cancelled" as const };
      const first = diffSchedule(input([fp1, cancelled], { isFallback: true }));
      expect(first.changes).toEqual([]);
      const plan = diffSchedule(input([fp1, cancelled], { isFallback: true, pending: first.pendingUpserts }));
      expect(plan.changes).toHaveLength(1);
    });
  });

  it("silently refreshes Round details and Session end times", () => {
    const renamed = { ...round, name: "United States Grand Prix" };
    const longer = { ...race, endsAt: "2026-10-25T22:15:00.000Z" };
    const plan = diffSchedule(input([fp1, longer], { incomingRound: renamed }));
    expect(plan.roundUpdates).toEqual([renamed]);
    expect(plan.sessionUpdates).toEqual([longer]);
    expect(plan.changes).toEqual([]);
  });
});
