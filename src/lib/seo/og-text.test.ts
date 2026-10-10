import { describe, expect, it } from "vitest";
import { formatUtc, ogAlt, seriesOgText } from "./og-text";
import { singapore, singaporeRound, singaporeSessions } from "./test-fixtures";

const featured = { kind: "round" as const, round: singaporeRound, roundNumber: 18, circuit: singapore, sessions: singaporeSessions };
const at = (iso: string) => Date.parse(iso);

describe("seriesOgText", () => {
  it("shows the Featured Round, Circuit, dates and the next Session in UTC", () => {
    expect(seriesOgText("f1", featured, at("2026-10-10T11:00:00Z"))).toEqual({
      eyebrow: "F1 · 2026",
      title: "Singapore Grand Prix",
      meta: "Marina Bay Street Circuit · 9–11 Oct 2026",
      status: "Next: Qualifying · Sat 10 Oct, 13:00 UTC",
    });
  });

  it("says which Session is live", () => {
    expect(seriesOgText("f1", featured, at("2026-10-11T12:30:00Z")).status).toBe("Live: Race");
  });

  it("skips cancelled Sessions when choosing the next one", () => {
    const sessions = singaporeSessions.map((s) => (s.type === "qualifying" ? { ...s, status: "cancelled" as const } : s));
    expect(seriesOgText("f1", { ...featured, sessions }, at("2026-10-10T11:00:00Z")).status).toBe("Next: Race · Sun 11 Oct, 12:00 UTC");
  });

  it("says the Round is complete during the grace period after its final Session", () => {
    expect(seriesOgText("f1", featured, at("2026-10-11T15:00:00Z")).status).toBe("Round complete");
  });

  it("says times are TBC instead of showing placeholder times", () => {
    const tbc = { ...featured, round: { ...singaporeRound, sessionTimesConfirmed: false } };
    expect(seriesOgText("f1", tbc, at("2026-10-01T00:00:00Z")).status).toBe("Session times TBC");
  });

  it("handles a complete season and a missing schedule", () => {
    expect(seriesOgText("wec", { kind: "season-complete", season: 2026 }, at("2026-12-01T00:00:00Z"))).toEqual({
      eyebrow: "WEC · 2026",
      title: "Season complete",
      meta: "The 2026 World Endurance Championship season is over",
      status: "2027 schedule coming soon",
    });
    expect(seriesOgText("fe", { kind: "unavailable" }, 0)).toMatchObject({ title: "Schedule coming soon", meta: null, status: null });
  });

  it("names numbered Rounds with their place", () => {
    const f2 = { ...featured, round: { ...singaporeRound, series: "f2" as const, name: "Round 11" } };
    expect(seriesOgText("f2", f2, at("2026-10-10T11:00:00Z")).title).toBe("Round 11 · Marina Bay");
  });
});

describe("formatUtc and ogAlt", () => {
  it("formats without a locale", () => {
    expect(formatUtc("2026-11-22T04:05:00Z")).toBe("Sun 22 Nov, 04:05 UTC");
  });

  it("joins the card's lines", () => {
    expect(ogAlt({ eyebrow: "F1 · 2026", title: "Season complete", meta: null, status: "2027 schedule coming soon" })).toBe(
      "F1 · 2026 — Season complete — 2027 schedule coming soon",
    );
  });
});
