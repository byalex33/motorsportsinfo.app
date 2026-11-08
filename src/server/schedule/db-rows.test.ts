import { describe, expect, it } from "vitest";
import type { Round } from "@/domain/types";
import { pageSlugsToStore, roundFromRow, roundToRow } from "./db-rows";

const round = (over: Partial<Round>): Round => ({
  id: "f1-2026-interlagos",
  series: "f1",
  season: 2026,
  slug: "interlagos",
  name: "São Paulo Grand Prix",
  circuitId: "interlagos",
  startDate: "2026-11-06",
  endDate: "2026-11-08",
  sessionTimesConfirmed: true,
  ...over,
});

const brazil = round({});
const singapore = round({
  id: "f1-2026-marina-bay",
  slug: "marina-bay",
  circuitId: "marina-bay",
  name: "Singapore Grand Prix",
  startDate: "2026-10-09",
  endDate: "2026-10-11",
});

describe("pageSlugsToStore", () => {
  it("stores a slug for a new Round and for a published Round that has none", () => {
    const slugs = pageSlugsToStore([singapore], [brazil]);
    expect(Object.fromEntries(slugs)).toEqual({
      [singapore.id]: "singapore-grand-prix",
      [brazil.id]: "sao-paulo-grand-prix",
    });
  });

  it("never replaces a stored slug, even when the source renames the Round", () => {
    const published = [{ ...brazil, pageSlug: "sao-paulo-grand-prix" }, { ...singapore, pageSlug: "singapore-grand-prix" }];
    expect(pageSlugsToStore(published, [{ ...brazil, name: "Brazilian Grand Prix" }]).size).toBe(0);
  });

  it("gives a new Round with a taken name the suffix pages would derive", () => {
    const published = [{ ...brazil, pageSlug: "sao-paulo-grand-prix" }];
    const second = round({ id: "f1-2026-interlagos-2", slug: "interlagos-2", startDate: "2026-11-13", endDate: "2026-11-15" });
    expect(Object.fromEntries(pageSlugsToStore(published, [second]))).toEqual({ [second.id]: "sao-paulo-grand-prix-2" });
  });

  it("stores no slug for a Round whose every Session is cancelled", () => {
    const ran = round({ id: "f1-2026-interlagos-2", slug: "interlagos-2", startDate: "2026-11-13", endDate: "2026-11-15" });
    const sessions = [
      { roundId: brazil.id, status: "cancelled" as const },
      { roundId: brazil.id, status: "cancelled" as const },
      { roundId: ran.id, status: "scheduled" as const },
    ];
    // The cancelled Round stays derived, so the Round that is run stores the plain slug.
    expect(Object.fromEntries(pageSlugsToStore([], [brazil, ran], sessions))).toEqual({ [ran.id]: "sao-paulo-grand-prix" });
  });

  it("skips a Round whose Circuit is unknown", () => {
    expect(pageSlugsToStore([], [round({ circuitId: "nowhere" })]).size).toBe(0);
  });
});

describe("Round rows", () => {
  it("reads the stored page slug and never writes one", () => {
    const now = new Date("2026-11-01T00:00:00Z");
    const row = { ...roundToRow(brazil, now), pageSlug: "sao-paulo-grand-prix", updatedAt: now };
    expect(roundFromRow(row as Parameters<typeof roundFromRow>[0]).pageSlug).toBe("sao-paulo-grand-prix");
    expect(roundFromRow({ ...row, pageSlug: null } as Parameters<typeof roundFromRow>[0])).not.toHaveProperty("pageSlug");
    expect(roundToRow({ ...brazil, pageSlug: "sao-paulo-grand-prix" }, now)).not.toHaveProperty("pageSlug");
  });
});
