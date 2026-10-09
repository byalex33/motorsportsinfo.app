// sportstimes as the only source for Formula E, IndyCar and MotoGP. Fixtures are the full 2026 files
// (localeKey removed) so every Round can be checked against the Circuit list.
import { describe, expect, it } from "vitest";
import { normaliseRounds } from "../normalise";
import { fixtureJson } from "../test-utils";
import {
  cleanIndyCarRoundName,
  motogpCircuit,
  parseSportstimes,
  sportstimesSession,
  type SportstimesRace,
  type SportstimesSeries,
} from "./sportstimes";

type Data = { races: SportstimesRace[] };

const load = (series: SportstimesSeries): Data => fixtureJson<Data>(`sportstimes-${series}-2026.json`);

function normalise(series: SportstimesSeries, data: Data = load(series)) {
  const parsed = parseSportstimes(data, 2026, series);
  return { ...normaliseRounds(series, parsed.rounds), warnings: parsed.warnings };
}

/** A copy of the fixture with one race changed. */
function withRace(series: SportstimesSeries, round: number, change: Partial<SportstimesRace>): Data {
  const data = load(series);
  return { races: data.races.map((r) => (r.round === round ? { ...r, ...change } : r)) };
}

const minutes = (s: { startsAt: string; endsAt: string }) => (Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 60000;

describe("every 2026 Round resolves to a Circuit", () => {
  it.each([
    ["fe", 17],
    ["indycar", 18],
    ["motogp", 22],
  ] as const)("%s: %i Rounds, no problems", (series, count) => {
    const { rounds, problems } = normalise(series);
    expect(problems).toEqual([]);
    expect(rounds).toHaveLength(count);
    expect(rounds.every((r) => r.round.sessionTimesConfirmed && r.sessions.length > 0)).toBe(true);
  });
});

describe("sportstimes Formula E", () => {
  const { rounds, warnings } = normalise("fe");
  const byId = Object.fromEntries(rounds.map((r) => [r.round.id, r]));

  it("matches Circuits by location, with double-headers as separate Rounds ('-2')", () => {
    expect(warnings).toEqual([]);
    expect(rounds.map((r) => r.round.id)).toEqual([
      "fe-2026-sao-paulo-street",
      "fe-2026-mexico-city",
      "fe-2026-miami",
      "fe-2026-jeddah",
      "fe-2026-jeddah-2",
      "fe-2026-jarama",
      "fe-2026-tempelhof",
      "fe-2026-tempelhof-2",
      "fe-2026-monaco",
      "fe-2026-monaco-2",
      "fe-2026-sanya",
      "fe-2026-shanghai",
      "fe-2026-shanghai-2",
      "fe-2026-tokyo",
      "fe-2026-tokyo-2",
      "fe-2026-excel-london",
      "fe-2026-excel-london-2",
    ]);
  });

  it("tells the São Paulo street circuit from Interlagos, and Jarama from the Madrid ePrix name", () => {
    expect(byId["fe-2026-sao-paulo-street"].round).toMatchObject({ name: "Sao Paulo ePrix", season: 2026, startDate: "2025-12-06" });
    expect(byId["fe-2026-jarama"].round.name).toBe("Madrid ePrix");
  });

  it("uses the ePrix name and maps Sessions with estimated ends", () => {
    const [first, second] = [byId["fe-2026-jeddah"], byId["fe-2026-jeddah-2"]];
    expect(first.round).toMatchObject({ name: "Jeddah ePrix", circuitId: "jeddah", startDate: "2026-02-12", endDate: "2026-02-13" });
    expect(first.sessions.map((s) => [s.id, s.type, s.name, minutes(s)])).toEqual([
      ["fe-2026-jeddah:free-practice-1", "practice", "Free Practice 1", 30],
      ["fe-2026-jeddah:free-practice-2", "practice", "Free Practice 2", 30],
      ["fe-2026-jeddah:qualifying", "qualifying", "Qualifying", 75],
      ["fe-2026-jeddah:race", "race", "Race", 60],
    ]);
    expect(second.sessions.map((s) => s.id)).toEqual([
      "fe-2026-jeddah-2:free-practice-3",
      "fe-2026-jeddah-2:qualifying",
      "fe-2026-jeddah-2:race",
    ]);
    expect(first.sessions.every((s) => s.endIsEstimated && s.status === "scheduled")).toBe(true);
  });

  it("treats tbc as Times TBC, keeping the dates", () => {
    const { rounds: r } = normalise("fe", withRace("fe", 16, { tbc: true }));
    const london = r.find((x) => x.round.id === "fe-2026-excel-london")!;
    expect(london.round).toMatchObject({ sessionTimesConfirmed: false, startDate: "2026-08-14", endDate: "2026-08-15" });
    expect(london.sessions).toEqual([]);
  });

  it("marks every Session of a canceled race as cancelled", () => {
    const { rounds: r } = normalise("fe", withRace("fe", 11, { canceled: true }));
    const sanya = r.find((x) => x.round.id === "fe-2026-sanya")!;
    expect(sanya.sessions.map((s) => s.status)).toEqual(["cancelled", "cancelled", "cancelled", "cancelled"]);
    expect(r.find((x) => x.round.id === "fe-2026-tokyo")!.sessions.every((s) => s.status === "scheduled")).toBe(true);
  });

  it("warns when the matched Circuit is far from the source coordinates", () => {
    const { warnings: w } = normalise("fe", withRace("fe", 14, { latitude: 34.69, longitude: 135.5 })); // Osaka
    expect(w).toEqual([expect.stringContaining("matched tokyo")]);
  });

  it("flags an unknown location instead of guessing", () => {
    const { rounds: r, problems } = normalise("fe", withRace("fe", 11, { location: "Hainan", slug: "hainan-eprix" }));
    expect(r).toHaveLength(16);
    expect(problems).toEqual([expect.stringContaining('Unknown Circuit for FE 2026 "Sanya ePrix"')]);
  });
});

describe("sportstimes IndyCar", () => {
  const { rounds, warnings } = normalise("indycar");

  it("matches all 18 Rounds by name and slug (no location, lat/lon 0)", () => {
    expect(warnings).toEqual([]);
    expect(rounds.map((r) => [r.round.id, r.round.name])).toEqual([
      ["indycar-2026-st-petersburg", "Grand Prix of St. Petersburg"],
      ["indycar-2026-phoenix", "Good Ranchers 250"],
      ["indycar-2026-arlington", "Grand Prix of Arlington"],
      ["indycar-2026-barber", "Children's of Alabama Indy Grand Prix"],
      ["indycar-2026-long-beach", "Grand Prix of Long Beach"],
      ["indycar-2026-indianapolis", "Sonsio Grand Prix"],
      ["indycar-2026-indianapolis-2", "Indianapolis 500"],
      ["indycar-2026-detroit", "Chevrolet Detroit Grand Prix"],
      ["indycar-2026-gateway", "Bommarito Automotive Group 500"],
      ["indycar-2026-road-america", "Grand Prix at Road America"],
      ["indycar-2026-mid-ohio", "Honda Indy 200 at Mid-Ohio"],
      ["indycar-2026-nashville-superspeedway", "Borchetta Bourbon Music City Grand Prix"],
      ["indycar-2026-portland", "Grand Prix of Portland"],
      ["indycar-2026-markham", "Ontario Honda Dealers Indy at Markham"],
      ["indycar-2026-washington-dc", "Grand Prix of Washington DC"],
      ["indycar-2026-milwaukee", "Snap-on Makers and Fixers 250"],
      ["indycar-2026-milwaukee-2", "Snap-on Milwaukee Mile 250"],
      ["indycar-2026-laguna-seca", "Grand Prix of Monterey"],
    ]);
  });

  it("cleans only safe sponsor prefixes from Round names", () => {
    expect(cleanIndyCarRoundName("110th Running of the Indianapolis 500")).toBe("Indianapolis 500");
    expect(cleanIndyCarRoundName("Acura Grand Prix of Long Beach")).toBe("Grand Prix of Long Beach");
    expect(cleanIndyCarRoundName("Freedom 250 Grand Prix of Washington DC")).toBe("Grand Prix of Washington DC");
    expect(cleanIndyCarRoundName("XPEL Grand Prix at Road America")).toBe("Grand Prix at Road America");
    expect(cleanIndyCarRoundName("Chevrolet Detroit Grand Prix")).toBe("Chevrolet Detroit Grand Prix");
    expect(cleanIndyCarRoundName("Snap-on Milwaukee Mile 250")).toBe("Snap-on Milwaukee Mile 250");
  });

  it("maps road course and oval Sessions", () => {
    const [stPete, phoenix] = rounds;
    expect(stPete.sessions.map((s) => [s.id.split(":")[1], s.type, s.name])).toEqual([
      ["practice-1", "practice", "Practice 1"],
      ["practice-2", "practice", "Practice 2"],
      ["qualifying", "qualifying", "Qualifying"],
      ["warm-up", "practice", "Warm-up"],
      ["race", "race", "Race"],
    ]);
    expect(phoenix.sessions.map((s) => [s.id.split(":")[1], s.type, s.name])).toEqual([
      ["practice-1", "practice", "Practice 1"],
      ["qualifying", "qualifying", "Qualifying"],
      ["practice-2", "practice", "Practice 2"],
      ["final-practice", "practice", "Final Practice"],
      ["race", "race", "Race"],
    ]);
  });

  it("gives the Indianapolis 500 its longer Race length", () => {
    const race = (id: string) => rounds.find((r) => r.round.id === id)!.sessions.find((s) => s.type === "race")!;
    expect(race("indycar-2026-indianapolis-2")).toMatchObject({
      startsAt: "2026-05-24T16:30:00.000Z",
      endsAt: "2026-05-24T20:00:00.000Z",
      endIsEstimated: true,
    });
    expect(minutes(race("indycar-2026-indianapolis"))).toBe(150);
  });

  it("keeps unknown practice-like keys as practice with a warning, and flags anything else", () => {
    const data = withRace("indycar", 18, {
      sessions: { ...load("indycar").races[17].sessions, extraPractice: "2026-09-05T15:00:00Z", autographs: "2026-09-05T16:00:00Z" },
    });
    const { rounds: r, problems, warnings: w } = normalise("indycar", data);
    const laguna = r.find((x) => x.round.id === "indycar-2026-laguna-seca")!;
    expect(laguna.sessions.find((s) => s.name === "extraPractice")).toMatchObject({ type: "practice", id: "indycar-2026-laguna-seca:extrapractice" });
    expect(w).toEqual([expect.stringContaining('Unknown Session key "extraPractice"')]);
    expect(problems).toEqual([expect.stringContaining('Unmapped Session "autographs"')]);
  });
});

describe("sportstimes MotoGP", () => {
  const { rounds, warnings } = normalise("motogp");
  const byId = Object.fromEntries(rounds.map((r) => [r.round.id, r]));

  it("matches Circuits by coordinates and names Rounds after the Grand Prix", () => {
    expect(rounds.map((r) => [r.round.id, r.round.name])).toEqual([
      ["motogp-2026-buriram", "Thai Grand Prix"],
      ["motogp-2026-goiania", "Brazilian Grand Prix"],
      ["motogp-2026-cota", "Grand Prix of the Americas"],
      ["motogp-2026-jerez", "Spanish Grand Prix"],
      ["motogp-2026-le-mans", "French Grand Prix"],
      ["motogp-2026-catalunya", "Catalan Grand Prix"],
      ["motogp-2026-mugello", "Italian Grand Prix"],
      ["motogp-2026-balaton-park", "Hungarian Grand Prix"],
      ["motogp-2026-brno", "Czech Grand Prix"],
      ["motogp-2026-assen", "Dutch TT"],
      ["motogp-2026-sachsenring", "German Grand Prix"],
      ["motogp-2026-silverstone", "British Grand Prix"],
      ["motogp-2026-aragon", "Aragon Grand Prix"],
      ["motogp-2026-misano", "San Marino Grand Prix"],
      ["motogp-2026-red-bull-ring", "Austrian Grand Prix"],
      ["motogp-2026-motegi", "Japanese Grand Prix"],
      ["motogp-2026-mandalika", "Indonesian Grand Prix"],
      ["motogp-2026-phillip-island", "Australian Grand Prix"],
      ["motogp-2026-sepang", "Malaysian Grand Prix"],
      ["motogp-2026-lusail", "Qatar Grand Prix"],
      ["motogp-2026-portimao", "Portuguese Grand Prix"],
      ["motogp-2026-valencia", "Valencia Grand Prix"],
    ]);
  });

  it("ignores a wrong `track` (Great Britain says MotorLand Aragón) and warns once", () => {
    expect(byId["motogp-2026-silverstone"].round.circuitId).toBe("silverstone");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('12 Great Britain: "MotorLand Aragón" → silverstone');
  });

  it("accepts a farther match only in the same country (Mandalika is ~27 km off)", () => {
    const race = load("motogp").races.find((r) => r.round === 17)!;
    expect(motogpCircuit(race)).toMatchObject({ circuit: { id: "mandalika" } });
    expect(motogpCircuit(race)!.km).toBeGreaterThan(10);
    expect(motogpCircuit({ ...race, location: "Malaysia" })).toBeNull();

    const { rounds: r, problems } = normalise("motogp", withRace("motogp", 17, { location: "Malaysia" }));
    expect(r.map((x) => x.round.id)).not.toContain("motogp-2026-mandalika");
    expect(problems).toEqual([expect.stringContaining('Unknown Circuit for MOTOGP 2026 "Indonesia Grand Prix"')]);
  });

  it("flags coordinates far from any known Circuit, even when `track` names one", () => {
    const { problems } = normalise("motogp", withRace("motogp", 12, { latitude: "53.5", longitude: "-2.0" }));
    expect(problems).toEqual([expect.stringContaining("Unknown Circuit")]);
  });

  it("falls back to '<name> Grand Prix' with a warning for a Circuit without a MotoGP name", () => {
    // Interlagos coordinates: a known Circuit, but not a 2026 MotoGP one.
    const { rounds: r, warnings: w } = normalise("motogp", withRace("motogp", 2, { latitude: "-23.70", longitude: "-46.70" }));
    expect(r.find((x) => x.round.circuitId === "interlagos")!.round.name).toBe("Brasil Grand Prix");
    expect(w).toEqual(expect.arrayContaining([expect.stringContaining("No MotoGP Round name for Circuit interlagos")]));
  });

  it("maps Sessions, with Session lengths that don't overlap the next Session", () => {
    expect(byId["motogp-2026-mandalika"].sessions.map((s) => [s.id.split(":")[1], s.type, s.name, minutes(s)])).toEqual([
      ["free-practice-1", "practice", "Free Practice 1", 45],
      ["practice", "practice", "Practice", 60],
      ["free-practice-2", "practice", "Free Practice 2", 30],
      ["q1", "qualifying", "Q1", 15],
      ["q2", "qualifying", "Q2", 15],
      ["sprint", "sprint", "Sprint", 25],
      ["warm-up", "practice", "Warm Up", 10],
      ["race", "race", "Race", 45],
    ]);
    for (const r of rounds) {
      for (let i = 1; i < r.sessions.length; i++) {
        expect(r.sessions[i - 1].endsAt <= r.sessions[i].startsAt, `${r.sessions[i - 1].id}`).toBe(true);
      }
    }
  });

  it("uses Track Time dates", () => {
    // Phillip Island's first Session is Thursday 23:45 UTC, Friday morning at the track.
    expect(byId["motogp-2026-phillip-island"].round).toMatchObject({ startDate: "2026-10-23", endDate: "2026-10-25" });
  });
});

describe("sportstimesSession", () => {
  it("keeps F2/F3 keys as before and maps the newer Series' keys", () => {
    expect(sportstimesSession("f2", "feature")).toEqual({ name: "Feature Race", type: "feature-race" });
    expect(sportstimesSession("f2", "practice2")).toBeNull();
    expect(sportstimesSession("fe", "practice3")).toEqual({ name: "Free Practice 3", type: "practice" });
    expect(sportstimesSession("indycar", "practice8")).toEqual({ name: "Practice 8", type: "practice" });
    expect(sportstimesSession("motogp", "qualifying2")).toEqual({ name: "Q2", type: "qualifying" });
    expect(sportstimesSession("motogp", "sprint")).toEqual({ name: "Sprint", type: "sprint" });
    expect(sportstimesSession("motogp", "parade")).toBeNull();
  });
});
