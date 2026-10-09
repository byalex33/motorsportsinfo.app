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

  it("publishes an explicit cancellation immediately", () => {
    const plan = diffSchedule(input([fp1, { ...race, status: "cancelled" }]));
    expect(plan.sessionUpdates).toEqual([{ ...race, status: "cancelled" }]);
    expect(plan.changes).toEqual([{ sessionId: race.id, kind: "cancelled", previousStartsAt: race.startsAt, newStartsAt: null }]);
  });

  it("does not re-announce an already cancelled Session", () => {
    const cancelled = { ...race, status: "cancelled" as const };
    const plan = diffSchedule(input([fp1, cancelled], { published: [fp1, cancelled] }));
    expect(plan.changes).toEqual([]);
    expect(plan.sessionUpdates).toEqual([]);
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
  });

  it("records source problems as flags once", () => {
    const problem = 'Unknown Circuit for F1 2026 "X Grand Prix"';
    expect(diffSchedule(input([fp1, race], { problems: [problem] })).flags).toEqual([{ sessionId: null, message: problem }]);
    expect(diffSchedule(input([fp1, race], { problems: [problem], flags: [{ id: 1, sessionId: null, message: problem }] })).flags).toEqual([]);
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

    it("still apply explicit cancellations", () => {
      const plan = diffSchedule(input([fp1, { ...race, status: "cancelled" }], { isFallback: true }));
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
