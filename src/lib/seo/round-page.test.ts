import { describe, expect, it } from "vitest";
import type { Circuit, Round } from "@/domain/types";
import {
  assignRoundPageSlugs,
  findRoundPage,
  findRoundPageRedirect,
  indexRoundPages,
  retiredRoundPagePath,
  roundPagePath,
  roundPageSeo,
  roundPageSlug,
} from "./round-page";
import { singapore, singaporeRound } from "./test-fixtures";

function source(
  round: Pick<Round, "id" | "series" | "season" | "slug" | "name" | "startDate" | "pageSlug">,
  circuit: Pick<Circuit, "name" | "location">,
  sessions?: { status: string }[],
) {
  return { round, circuit, sessions };
}

describe("roundPageSlug", () => {
  it("slugs the Round's name, not the Circuit id", () => {
    const round = { ...singaporeRound, slug: "cota", name: "United States Grand Prix", circuitId: "cota" };
    expect(roundPageSlug(source(round, { name: "Circuit of the Americas", location: "Austin, United States" }))).toBe(
      "united-states-grand-prix",
    );
    expect(roundPagePath("f1", 2026, "united-states-grand-prix")).toBe("/f1/2026/united-states-grand-prix");
  });

  it("puts the place in a numbered Round's slug and strips accents", () => {
    const round = { ...singaporeRound, series: "f2" as const, name: "Round 13", slug: "baku" };
    expect(roundPageSlug(source(round, { name: "Baku City Circuit", location: "Baku, Azerbaijan" }))).toBe("round-13-baku");
    const sao = { ...singaporeRound, name: "São Paulo E-Prix", slug: "interlagos" };
    expect(roundPageSlug(source(sao, { name: "Autódromo", location: "São Paulo, Brazil" }))).toBe("sao-paulo-e-prix");
  });

  it("falls back to the Circuit slug when the name slugs to nothing", () => {
    const round = { ...singaporeRound, name: "---", slug: "cota" };
    expect(roundPageSlug(source(round, singapore))).toBe("cota");
  });
});

describe("assignRoundPageSlugs", () => {
  const circuit = { name: "São Paulo", location: "São Paulo, Brazil" };
  const first: Round = { ...singaporeRound, id: "fe-2026-interlagos", series: "fe", slug: "interlagos", name: "São Paulo E-Prix", startDate: "2026-12-05" };
  const second: Round = { ...first, id: "fe-2026-interlagos-2", slug: "interlagos-2", startDate: "2026-12-06" };
  const nextYear: Round = { ...first, id: "fe-2027-interlagos", season: 2027, startDate: "2027-12-04" };

  it("gives a later Round with the same name a suffix, and starts again next season", () => {
    const slugs = assignRoundPageSlugs([
      source(second, circuit),
      source(nextYear, circuit),
      source(first, circuit),
    ]);
    expect(slugs.get(first.id)).toBe("sao-paulo-e-prix");
    expect(slugs.get(second.id)).toBe("sao-paulo-e-prix-2");
    expect(slugs.get(nextYear.id)).toBe("sao-paulo-e-prix");
  });

  it("finds a Round by the slug every surface would link to", () => {
    const rounds = [source(first, circuit), source(second, circuit)];
    const found = findRoundPage(rounds, 2026, "sao-paulo-e-prix-2");
    expect(found?.round.id).toBe(second.id);
    expect(found?.path).toBe("/fe/2026/sao-paulo-e-prix-2");
    expect(findRoundPage(rounds, 2026, "sao-paulo-e-prix")?.round.id).toBe(first.id);
    expect(findRoundPage(rounds, 2025, "sao-paulo-e-prix")).toBeNull();
    expect(indexRoundPages(rounds)).toHaveLength(2);
  });

  it("gives the Round that was run the plain slug and redirects the old collision suffix", () => {
    const circuit = { name: "Bahrain International Circuit", location: "Sakhir, Bahrain" };
    const sepang = { name: "Sepang International Circuit", location: "Sepang, Malaysia" };
    const cancelled: Round = {
      ...singaporeRound,
      id: "f1-2026-sakhir",
      slug: "sakhir",
      name: "Bahrain Grand Prix",
      startDate: "2026-04-10",
      endDate: "2026-04-12",
    };
    const ran: Round = {
      ...singaporeRound,
      id: "f1-2026-sepang",
      slug: "sepang",
      name: "Bahrain Grand Prix",
      startDate: "2026-10-02",
      endDate: "2026-10-04",
    };
    const rounds = [
      source(cancelled, circuit, [{ status: "cancelled" }, { status: "cancelled" }]),
      source(ran, sepang, [{ status: "scheduled" }]),
    ];
    const slugs = assignRoundPageSlugs(rounds);
    expect(slugs.get(ran.id)).toBe("bahrain-grand-prix");
    expect(slugs.get(cancelled.id)).toBe("bahrain-grand-prix-cancelled");
    expect(retiredRoundPagePath(rounds, 2026, "bahrain-grand-prix-2")).toBe("/f1/2026/bahrain-grand-prix");
    expect(retiredRoundPagePath(rounds, 2026, "bahrain-grand-prix")).toBeNull();
    expect(findRoundPage(rounds, 2026, "bahrain-grand-prix")?.round.id).toBe(ran.id);
  });

  it("keeps a cancelled Round's own slug when no other Round needs it", () => {
    const circuit = { name: "Jeddah Corniche Circuit", location: "Jeddah, Saudi Arabia" };
    const cancelled: Round = {
      ...singaporeRound,
      id: "f1-2026-jeddah",
      slug: "jeddah",
      name: "Saudi Arabian Grand Prix",
      startDate: "2026-04-17",
      endDate: "2026-04-19",
    };
    const rounds = [source(cancelled, circuit, [{ status: "cancelled" }])];
    expect(assignRoundPageSlugs(rounds).get(cancelled.id)).toBe("saudi-arabian-grand-prix");
    expect(retiredRoundPagePath(rounds, 2026, "saudi-arabian-grand-prix")).toBeNull();
    expect(findRoundPage(rounds, 2026, "saudi-arabian-grand-prix")?.round.id).toBe(cancelled.id);
  });

  it("does not point an old suffix at a different Round that still uses it", () => {
    const circuit = { name: "São Paulo", location: "São Paulo, Brazil" };
    const dropped: Round = { ...first, id: "fe-2026-dropped", startDate: "2026-12-04" };
    const rounds = [
      source(dropped, circuit, [{ status: "cancelled" }]),
      source(first, circuit, [{ status: "scheduled" }]),
      source(second, circuit, [{ status: "scheduled" }]),
    ];
    const slugs = assignRoundPageSlugs(rounds);
    expect(slugs.get(first.id)).toBe("sao-paulo-e-prix");
    expect(slugs.get(second.id)).toBe("sao-paulo-e-prix-3");
    expect(retiredRoundPagePath(rounds, 2026, "sao-paulo-e-prix-2")).toBe("/fe/2026/sao-paulo-e-prix");
    expect(retiredRoundPagePath(rounds, 2026, "sao-paulo-e-prix-3")).toBeNull();
  });
});

describe("stored page slugs", () => {
  const interlagos = { name: "Autódromo José Carlos Pace", location: "São Paulo, Brazil" };
  const sakhir = { name: "Bahrain International Circuit", location: "Sakhir, Bahrain" };
  // Published by OpenF1 as "São Paulo Grand Prix", then renamed by Jolpica (the fallback).
  const brazil: Round = {
    ...singaporeRound,
    id: "f1-2026-interlagos",
    slug: "interlagos",
    circuitId: "interlagos",
    name: "Brazilian Grand Prix",
    startDate: "2026-11-06",
    endDate: "2026-11-08",
    pageSlug: "sao-paulo-grand-prix",
  };
  const bahrain: Round = {
    ...singaporeRound,
    id: "f1-2026-sakhir",
    slug: "sakhir",
    circuitId: "sakhir",
    name: "Bahrain Grand Prix",
    startDate: "2026-04-10",
    endDate: "2026-04-12",
    pageSlug: "bahrain-grand-prix",
  };
  const rounds = [source(bahrain, sakhir), source(singaporeRound, singapore), source(brazil, interlagos)];

  it("keeps a stored slug when the Round is renamed", () => {
    const indexed = indexRoundPages(rounds);
    expect(indexed.find((r) => r.round.id === brazil.id)?.path).toBe("/f1/2026/sao-paulo-grand-prix");
    expect(findRoundPage(rounds, 2026, "sao-paulo-grand-prix")?.round.id).toBe(brazil.id);
    expect(findRoundPage(rounds, 2026, "brazilian-grand-prix")).toBeNull();
    // Rounds with no stored slug (the live sources) still derive it from the name.
    expect(indexed.find((r) => r.round.id === singaporeRound.id)?.pageSlug).toBe("singapore-grand-prix");
  });

  it("gives a new Round a suffix rather than another Round's stored slug", () => {
    const renamed: Round = { ...singaporeRound, name: "Sao Paulo Grand Prix" };
    const slugs = assignRoundPageSlugs([source(brazil, interlagos), source(renamed, singapore)]);
    expect(slugs.get(brazil.id)).toBe("sao-paulo-grand-prix");
    expect(slugs.get(renamed.id)).toBe("sao-paulo-grand-prix-2");
  });

  it("redirects the other source's name, the current name and the Circuit id to the stored slug", () => {
    for (const slug of ["brazilian-grand-prix", "interlagos"]) {
      expect(findRoundPageRedirect(rounds, 2026, slug)?.path).toBe("/f1/2026/sao-paulo-grand-prix");
    }
    // Stored under the fallback's name; the primary's name has no words in common with it.
    const stored = [source({ ...brazil, name: "São Paulo Grand Prix", pageSlug: "brazilian-grand-prix" }, interlagos)];
    expect(findRoundPageRedirect(stored, 2026, "sao-paulo-grand-prix")?.path).toBe("/f1/2026/brazilian-grand-prix");
    // A name that only adds words.
    expect(findRoundPageRedirect(rounds, 2026, "bahrain-grand-prix-in-malaysia")?.path).toBe("/f1/2026/bahrain-grand-prix");
    const malaysia = [source({ ...bahrain, pageSlug: "bahrain-grand-prix-in-malaysia" }, sakhir)];
    expect(findRoundPageRedirect(malaysia, 2026, "bahrain-grand-prix")?.path).toBe("/f1/2026/bahrain-grand-prix-in-malaysia");
  });

  it("uses the added words to pick between two Rounds with the same name", () => {
    // OpenF1 lists "Bahrain Grand Prix" twice in 2026; Jolpica calls the second one "… in Malaysia".
    const sepang = { name: "Sepang International Circuit", location: "Sepang, Malaysia" };
    const second: Round = { ...bahrain, id: "f1-2026-sepang", slug: "sepang", circuitId: "sepang", startDate: "2026-09-25", endDate: "2026-09-27" };
    const live = [source({ ...bahrain, pageSlug: undefined }, sakhir), source({ ...second, pageSlug: undefined }, sepang)];
    expect(findRoundPageRedirect(live, 2026, "bahrain-grand-prix-in-malaysia")?.path).toBe("/f1/2026/bahrain-grand-prix-2");
    // Words that describe neither Circuit stay ambiguous.
    expect(findRoundPageRedirect(live, 2026, "bahrain-grand-prix-in-qatar")).toBeNull();
  });

  it("keeps a stored slug ahead of the cancelled-Round rules", () => {
    const sepang = { name: "Sepang International Circuit", location: "Sepang, Malaysia" };
    const april: Round = { ...bahrain, pageSlug: undefined };
    const ran: Round = { ...bahrain, id: "f1-2026-sepang", slug: "sepang", circuitId: "sepang", startDate: "2026-10-02", endDate: "2026-10-04" };
    const cancelled = [{ status: "cancelled" }];
    // The Round that was run stored the plain slug; the cancelled one has none, so it moves aside.
    const stored = assignRoundPageSlugs([source(april, sakhir, cancelled), source(ran, sepang, [{ status: "scheduled" }])]);
    expect(stored.get(ran.id)).toBe("bahrain-grand-prix");
    expect(stored.get(april.id)).toBe("bahrain-grand-prix-cancelled");
    // A Round cancelled after its slug was stored keeps it: a stored URL never changes.
    const late = assignRoundPageSlugs([
      source({ ...april, pageSlug: "bahrain-grand-prix" }, sakhir, cancelled),
      source({ ...ran, pageSlug: undefined }, sepang, [{ status: "scheduled" }]),
    ]);
    expect(late.get(april.id)).toBe("bahrain-grand-prix");
    expect(late.get(ran.id)).toBe("bahrain-grand-prix-2");
  });

  it("does not redirect another season, an unknown slug or a collision suffix", () => {
    expect(findRoundPageRedirect(rounds, 2025, "brazilian-grand-prix")).toBeNull();
    expect(findRoundPageRedirect(rounds, 2026, "italian-grand-prix")).toBeNull();
    expect(findRoundPageRedirect(rounds, 2026, "bahrain-grand-prix-2")).toBeNull();
  });
});

describe("roundPageSeo", () => {
  it("names the Round, the year and the timetable", () => {
    const seo = roundPageSeo("f1", singaporeRound, singapore);
    expect(seo.title).toBe("F1 Singapore Grand Prix 2026 schedule – session times & weather");
    expect(seo.description).toContain("Marina Bay Street Circuit");
    expect(seo.description).toContain("full F1 timetable");
    expect(seo.lead).toContain("F1 Singapore Grand Prix 2026");
  });

  it("says times are TBC instead of promising a timetable", () => {
    const seo = roundPageSeo("f1", { ...singaporeRound, sessionTimesConfirmed: false }, singapore);
    expect(seo.title).toContain("times TBC");
    expect(seo.lead).toContain("TBC");
  });

  it("says a cancelled Round was cancelled", () => {
    const seo = roundPageSeo("f1", singaporeRound, singapore, "singapore-grand-prix", true);
    expect(seo.title).toBe("F1 Singapore Grand Prix 2026 cancelled");
    expect(seo.lead).toContain("was cancelled");
    expect(seo.description).not.toContain("full F1 timetable");
  });

  it("puts the dates in the title when the page slug was suffixed to avoid a clash", () => {
    const seo = roundPageSeo("f1", singaporeRound, singapore, "singapore-grand-prix-2");
    expect(seo.title).toContain("9–11 Oct 2026");
    expect(roundPageSeo("f1", singaporeRound, singapore, "singapore-grand-prix").title).not.toContain("9–11 Oct");
  });

  it("keeps the dates out of the title when the Round's own name ends in a number", () => {
    const daytona = { ...singaporeRound, series: "nascar" as const, name: "Daytona 500", slug: "daytona", startDate: "2026-02-15", endDate: "2026-02-15" };
    const speedway = { ...singapore, id: "daytona", name: "Daytona International Speedway", location: "Daytona Beach, United States" };
    expect(roundPageSeo("nascar", daytona, speedway, "daytona-500").title).not.toContain("15 Feb");
    expect(roundPageSeo("nascar", daytona, speedway, "daytona-500-2").title).toContain("15 Feb 2026");
    const indy = { ...daytona, series: "indycar" as const, name: "Indianapolis 500" };
    expect(roundPageSeo("indycar", indy, speedway, "indianapolis-500").title).toBe("IndyCar Indianapolis 500 2026 schedule – session times & weather");
  });

  it("does not promise a finished Round's times 'once published'", () => {
    const unconfirmed = { ...singaporeRound, sessionTimesConfirmed: false };
    const after = roundPageSeo("f1", unconfirmed, singapore, "singapore-grand-prix", false, "2026-10-20T12:00:00.000Z");
    for (const text of [after.title, after.description, after.lead]) {
      expect(text).not.toMatch(/TBC|once published/);
    }
    expect(after.lead).toContain("has finished");
    const before = roundPageSeo("f1", unconfirmed, singapore, "singapore-grand-prix", false, "2026-10-01T12:00:00.000Z");
    expect(before.title).toContain("times TBC");
  });
});
