import { describe, expect, it } from "vitest";
import type { Circuit, Round } from "@/domain/types";
import { assignRoundPageSlugs, findRoundPage, indexRoundPages, retiredRoundPagePath, roundPagePath, roundPageSeo, roundPageSlug } from "./round-page";
import { singapore, singaporeRound } from "./test-fixtures";

function source(
  round: Pick<Round, "id" | "series" | "season" | "slug" | "name" | "startDate">,
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
});
