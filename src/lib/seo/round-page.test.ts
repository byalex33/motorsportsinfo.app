import { describe, expect, it } from "vitest";
import type { Circuit, Round } from "@/domain/types";
import { assignRoundPageSlugs, findRoundPage, indexRoundPages, roundPagePath, roundPageSeo, roundPageSlug } from "./round-page";
import { singapore, singaporeRound } from "./test-fixtures";

function source(round: Pick<Round, "id" | "series" | "season" | "slug" | "name" | "startDate">, circuit: Pick<Circuit, "name" | "location">) {
  return { round, circuit };
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

  it("puts the dates in the title when the page slug was suffixed to avoid a clash", () => {
    const seo = roundPageSeo("f1", singaporeRound, singapore, "singapore-grand-prix-2");
    expect(seo.title).toContain("9–11 Oct 2026");
    expect(roundPageSeo("f1", singaporeRound, singapore, "singapore-grand-prix").title).not.toContain("9–11 Oct");
  });
});
