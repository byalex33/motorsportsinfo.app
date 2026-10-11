import { describe, expect, it } from "vitest";
import type { Circuit, FeaturedRoundResult, Round, Session } from "@/domain/types";
import { formatStartsIn, nextSession, toSeriesSummary, type SummarySession } from "./series-summary";

const circuit: Circuit = {
  id: "marina-bay",
  name: "Marina Bay Street Circuit",
  location: "Singapore, Singapore",
  lat: 1.29,
  lon: 103.86,
  timeZone: "Asia/Singapore",
  hasRadarCoverage: true,
};

function round(opts: Partial<Round> = {}): Round {
  return {
    id: "f1-2026-singapore",
    series: "f1",
    season: 2026,
    slug: "singapore",
    name: "Singapore Grand Prix",
    circuitId: circuit.id,
    startDate: "2026-10-09",
    endDate: "2026-10-11",
    sessionTimesConfirmed: true,
    ...opts,
  };
}

function session(slug: string, startsAt: string, endsAt: string, opts: Partial<Session> = {}): Session {
  return {
    id: `f1-2026-singapore:${slug}`,
    roundId: "f1-2026-singapore",
    series: "f1",
    type: "practice",
    name: slug,
    startsAt,
    endsAt,
    endIsEstimated: false,
    status: "scheduled",
    ...opts,
  };
}

const quali = session("Qualifying", "2026-10-10T13:00:00Z", "2026-10-10T14:00:00Z", { type: "qualifying" });
const race = session("Race", "2026-10-11T12:00:00Z", "2026-10-11T14:00:00Z", { type: "race" });
const fp3 = session("Practice 3", "2026-10-10T09:30:00Z", "2026-10-10T10:30:00Z");
const cancelled = session("Practice 2", "2026-10-10T08:00:00Z", "2026-10-10T08:30:00Z", { status: "cancelled" });

function featured(r: Round, sessions: Session[]): FeaturedRoundResult {
  return { kind: "round", round: r, roundNumber: 18, circuit, sessions };
}

describe("toSeriesSummary", () => {
  it("keeps the Round's name and dates, and only Sessions still to come or running", () => {
    const summary = toSeriesSummary(featured(round(), [race, quali, cancelled, fp3]), "2026-10-10T11:00:00Z");
    expect(summary).toMatchObject({
      kind: "round",
      roundName: "Singapore Grand Prix",
      dates: "9–11 Oct 2026",
      circuitTimeZone: "Asia/Singapore",
      timesConfirmed: true,
      renderedAt: "2026-10-10T11:00:00Z",
    });
    if (summary.kind !== "round") throw new Error("expected a round");
    expect(summary.sessions.map((s) => s.name)).toEqual(["Qualifying", "Race"]);
    expect(summary.sessions[0]).toEqual({ id: quali.id, name: "Qualifying", startsAt: quali.startsAt, endsAt: quali.endsAt });
    expect(summary.trackTimes[quali.id]).toEqual({ weekday: "Sat", clock: "21:00", offset: "GMT+8" });
  });

  it("names a numbered Round by its place", () => {
    const summary = toSeriesSummary(featured(round({ name: "Round 13" }), []), "2026-10-10T11:00:00Z");
    expect(summary.kind === "round" && summary.roundName).toBe("Round 13 · Singapore");
  });

  it("carries no Sessions while times are TBC", () => {
    const summary = toSeriesSummary(featured(round({ sessionTimesConfirmed: false }), [race]), "2026-10-01T00:00:00Z");
    expect(summary).toMatchObject({ kind: "round", timesConfirmed: false, sessions: [], trackTimes: {} });
  });

  it("passes through season complete and unavailable", () => {
    expect(toSeriesSummary({ kind: "season-complete", season: 2026 }, "2026-12-10T00:00:00Z")).toEqual({ kind: "season-complete", season: 2026 });
    expect(toSeriesSummary({ kind: "unavailable" }, "2026-12-10T00:00:00Z")).toEqual({ kind: "unavailable" });
  });
});

describe("nextSession", () => {
  const sessions: SummarySession[] = [quali, race].map(({ id, name, startsAt, endsAt }) => ({ id, name, startsAt, endsAt }));
  const t = (iso: string) => Date.parse(iso);

  it("is the next Session to start", () => {
    expect(nextSession(sessions, t("2026-10-10T11:00:00Z"))).toEqual({ kind: "upcoming", session: sessions[0] });
  });

  it("is the running Session while it runs", () => {
    expect(nextSession(sessions, t("2026-10-10T13:30:00Z"))).toEqual({ kind: "live", session: sessions[0] });
  });

  it("moves on once a Session ends", () => {
    expect(nextSession(sessions, t("2026-10-10T14:00:00Z"))).toEqual({ kind: "upcoming", session: sessions[1] });
  });

  it("is finished after the last Session", () => {
    expect(nextSession(sessions, t("2026-10-11T14:00:00Z"))).toEqual({ kind: "finished" });
    expect(nextSession([], t("2026-10-11T14:00:00Z"))).toEqual({ kind: "finished" });
  });
});

describe("formatStartsIn", () => {
  const MIN = 60_000;
  it("shows days and hours a day or more out", () => {
    expect(formatStartsIn((3 * 1440 + 4 * 60 + 59) * MIN)).toBe("in 3d 4h");
  });
  it("shows hours and padded minutes within a day", () => {
    expect(formatStartsIn((5 * 60 + 7) * MIN + 30_000)).toBe("in 5h 07m");
  });
  it("shows minutes within the hour, and now under a minute", () => {
    expect(formatStartsIn(12 * MIN)).toBe("in 12m");
    expect(formatStartsIn(59_000)).toBe("now");
    expect(formatStartsIn(-5_000)).toBe("now");
  });
});
