import { describe, expect, it } from "vitest";
import { normaliseRounds } from "../normalise";
import { fixture, fixtureJson } from "../test-utils";
import { parseJolpica, type JolpicaResponse } from "./jolpica";
import { openF1SessionType, parseOpenF1, type OpenF1Meeting, type OpenF1Session } from "./openf1";
import { parseSportstimes, type SportstimesRace } from "./sportstimes";
import { parseWecDateRange, parseWecRaceLinks, parseWecRacePage, wecSessionType } from "./wec";

describe("OpenF1", () => {
  const raw2026 = parseOpenF1(
    fixtureJson<OpenF1Meeting[]>("openf1-meetings-2026.json"),
    fixtureJson<OpenF1Session[]>("openf1-sessions-2026.json"),
  );
  const { rounds, problems } = normaliseRounds("f1", raw2026);
  const byId = Object.fromEntries(rounds.map((r) => [r.round.id, r]));

  it("skips pre-season testing and normalises every Round", () => {
    expect(problems).toEqual([]);
    expect(rounds.map((r) => r.round.id)).toEqual([
      "f1-2026-sakhir",
      "f1-2026-sepang",
      "f1-2026-marina-bay",
      "f1-2026-las-vegas",
    ]);
  });

  it("maps the relocated 2026 Bahrain Grand Prix to Sepang by location, not by name", () => {
    const r = byId["f1-2026-sepang"];
    expect(r.round.name).toBe("Bahrain Grand Prix");
    expect(r.round.circuitId).toBe("sepang");
    expect(r.round.startDate).toBe("2026-10-02");
    expect(r.round.endDate).toBe("2026-10-04");
  });

  it("marks Sessions cancelled only when OpenF1 says is_cancelled", () => {
    expect(byId["f1-2026-sakhir"].sessions.every((s) => s.status === "cancelled")).toBe(true);
    expect(byId["f1-2026-sepang"].sessions.every((s) => s.status === "scheduled")).toBe(true);
  });

  it("maps Session Types, keeps names, and uses source end times", () => {
    const sg = byId["f1-2026-marina-bay"];
    expect(sg.sessions.map((s) => [s.id, s.type, s.name])).toEqual([
      ["f1-2026-marina-bay:practice-1", "practice", "Practice 1"],
      ["f1-2026-marina-bay:sprint-qualifying", "sprint-qualifying", "Sprint Qualifying"],
      ["f1-2026-marina-bay:sprint", "sprint", "Sprint"],
      ["f1-2026-marina-bay:qualifying", "qualifying", "Qualifying"],
      ["f1-2026-marina-bay:race", "race", "Race"],
    ]);
    expect(sg.sessions[1]).toMatchObject({
      startsAt: "2026-10-09T12:30:00.000Z",
      endsAt: "2026-10-09T13:14:00.000Z",
      endIsEstimated: false,
    });
  });

  it("computes Round dates in Track Time (Las Vegas starts on Thursday local)", () => {
    expect(byId["f1-2026-las-vegas"].round).toMatchObject({ startDate: "2026-11-19", endDate: "2026-11-21" });
  });

  it("treats next season's placeholder Sessions as Times TBC", () => {
    const raw = parseOpenF1(
      fixtureJson<OpenF1Meeting[]>("openf1-meetings-2027.json"),
      fixtureJson<OpenF1Session[]>("openf1-sessions-2027.json"),
    );
    const { rounds: r2027 } = normaliseRounds("f1", raw);
    expect(r2027).toHaveLength(1);
    expect(r2027[0].round).toMatchObject({
      id: "f1-2027-sakhir",
      sessionTimesConfirmed: false,
      startDate: "2027-03-12",
      endDate: "2027-03-14",
    });
    expect(r2027[0].sessions).toEqual([]);
  });

  it("maps OpenF1 Session names", () => {
    expect(openF1SessionType("Practice 3")).toBe("practice");
    expect(openF1SessionType("Sprint Shootout")).toBe("sprint-qualifying");
    expect(openF1SessionType("Day 1")).toBeNull();
  });
});

describe("Jolpica", () => {
  const { rounds, problems } = normaliseRounds("f1", parseJolpica(fixtureJson<JolpicaResponse>("jolpica-2026.json")));

  it("produces the same Round and Session ids as OpenF1, with estimated ends", () => {
    expect(problems).toEqual([]);
    expect(rounds.map((r) => r.round.id)).toEqual(["f1-2026-sepang", "f1-2026-marina-bay", "f1-2026-las-vegas"]);
    const sg = rounds[1];
    expect(sg.sessions.map((s) => s.id)).toEqual([
      "f1-2026-marina-bay:practice-1",
      "f1-2026-marina-bay:sprint-qualifying",
      "f1-2026-marina-bay:sprint",
      "f1-2026-marina-bay:qualifying",
      "f1-2026-marina-bay:race",
    ]);
    const race = sg.sessions.at(-1)!;
    expect(race).toMatchObject({ startsAt: "2026-10-11T12:00:00.000Z", endsAt: "2026-10-11T14:00:00.000Z", endIsEstimated: true });
    expect(sg.sessions[0]).toMatchObject({ endsAt: "2026-10-09T09:30:00.000Z", endIsEstimated: true });
  });
});

describe("sportstimes (F2/F3)", () => {
  const parsed = parseSportstimes(fixtureJson<{ races: SportstimesRace[] }>("sportstimes-f2-2026.json"), 2026, "f2");
  const { rounds, problems } = normaliseRounds("f2", parsed.rounds);

  it("matches Circuits by name (Doha → Lusail) and uses the official Session ids", () => {
    expect(problems).toEqual([]);
    expect(parsed.warnings).toEqual([]);
    expect(rounds.map((r) => r.round.id)).toEqual(["f2-2026-albert-park", "f2-2026-baku", "f2-2026-lusail", "f2-2026-yas-marina"]);
    expect(rounds[1].sessions.map((s) => s.id.split(":")[1])).toEqual(["practice", "qualifying", "sprint-race", "feature-race"]);
    expect(rounds[1].sessions.every((s) => s.endIsEstimated)).toBe(true);
  });

  it("uses Track Time dates (Melbourne's first UTC day is the day before)", () => {
    expect(rounds[0].round).toMatchObject({ startDate: "2026-03-06", endDate: "2026-03-08" });
  });

  it("treats tbc Rounds as Times TBC", () => {
    expect(rounds[3].round.sessionTimesConfirmed).toBe(false);
    expect(rounds[3].sessions).toEqual([]);
  });
});

describe("WEC", () => {
  it("lists this season's race pages and next season's from the header, without the Prologue", () => {
    const html = fixture("wec-season-2026.html");
    expect(parseWecRaceLinks(html, 2026)).toEqual([
      "6-hours-of-imola-2026",
      "totalenergies-6-hours-of-spa-francorchamps-2026",
      "24-hours-of-le-mans-2026",
      "rolex-6-hours-of-sao-paulo-2026",
      "lone-star-le-mans-2026",
      "6-hours-of-fuji-2026",
      "6-hours-of-barcelona-2026",
      "6-hours-of-monza-2026",
    ]);
    expect(parseWecRaceLinks(html, 2027)[0]).toBe("qatar-1812km-2027");
    expect(parseWecRaceLinks(html, 2027)).toHaveLength(9);
  });

  it("parses a race page: names, data-timestamp starts, Hyperpole, estimated ends from the Round name", () => {
    const raw = parseWecRacePage(fixture("wec-race-barcelona-2026.html"), {
      season: 2026,
      slug: "6-hours-of-barcelona-2026",
      url: "https://www.fiawec.com/en/race/6-hours-of-barcelona-2026",
    });
    const { rounds, problems } = normaliseRounds("wec", [raw]);
    expect(problems).toEqual([]);
    const [r] = rounds;
    expect(r.round).toMatchObject({
      id: "wec-2026-catalunya",
      name: "6 Hours of Barcelona",
      startDate: "2026-10-16",
      endDate: "2026-10-18",
      sessionTimesConfirmed: true,
    });
    expect(r.sessions.map((s) => [s.id.split(":")[1], s.type])).toEqual([
      ["free-practice-1", "practice"],
      ["free-practice-2", "practice"],
      ["free-practice-3-lmgt3", "practice"],
      ["qualifying-lmgt3", "qualifying"],
      ["hyperpole-lmgt3", "hyperpole"],
      ["free-practice-3-hypercar", "practice"],
      ["qualifying-hypercar", "qualifying"],
      ["hyperpole-hypercar", "hyperpole"],
      ["race", "race"],
    ]);
    const race = r.sessions.at(-1)!;
    expect(race).toMatchObject({
      name: "Race",
      startsAt: "2026-10-18T10:00:00.000Z",
      endsAt: "2026-10-18T16:00:00.000Z",
      endIsEstimated: true,
    });
  });

  it("uses 24 hours for the Le Mans Race", () => {
    const raw = parseWecRacePage(fixture("wec-race-le-mans-2026.html"), { season: 2026, slug: "24-hours-of-le-mans-2026", url: "x" });
    const { rounds } = normaliseRounds("wec", [raw]);
    expect(rounds[0].round.circuitId).toBe("le-mans");
    expect(rounds[0].sessions).toHaveLength(12);
    expect(rounds[0].sessions.find((s) => s.type === "race")).toMatchObject({
      startsAt: "2026-06-13T14:00:00.000Z",
      endsAt: "2026-06-14T14:00:00.000Z",
    });
    expect(rounds[0].sessions.find((s) => s.name === "Warm-up")?.type).toBe("practice");
  });

  it("treats a page with only a provisional Race as Times TBC, keeping its dates", () => {
    const raw = parseWecRacePage(fixture("wec-race-qatar-2027.html"), { season: 2027, slug: "qatar-1812km-2027", url: "x" });
    const { rounds } = normaliseRounds("wec", [raw]);
    expect(rounds[0].round).toMatchObject({
      id: "wec-2027-lusail",
      name: "Qatar 1812km",
      sessionTimesConfirmed: false,
      startDate: "2027-03-25",
      endDate: "2027-03-27",
    });
  });

  it("parses date ranges and Session names", () => {
    expect(parseWecDateRange("From 30 September to 2 October 2026")).toEqual({ startDate: "2026-09-30", endDate: "2026-10-02" });
    expect(wecSessionType("Hyperpole 2 - HYPERCAR")).toBe("hyperpole");
    expect(wecSessionType("Qualifying - LMP2 & LMGT3")).toBe("qualifying");
    expect(wecSessionType("Race")).toBe("race");
    expect(wecSessionType("Autograph session")).toBeNull();
  });
});
