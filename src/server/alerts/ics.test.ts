import { describe, expect, it } from "vitest";
import type { Circuit, Round, Session } from "@/domain/types";
import type { SessionWithContext } from "@/server/schedule";
import { buildCalendar, escapeText, foldLine, formatIcsDate } from "./ics";

const circuit: Circuit = {
  id: "las-vegas",
  name: "Las Vegas Strip Circuit",
  location: "Las Vegas, United States",
  lat: 36.1,
  lon: -115.1,
  timeZone: "America/Los_Angeles",
  hasRadarCoverage: true,
};

const round: Round = {
  id: "f1-2026-las-vegas",
  series: "f1",
  season: 2026,
  slug: "las-vegas",
  name: "Las Vegas Grand Prix",
  circuitId: "las-vegas",
  startDate: "2026-11-19",
  endDate: "2026-11-21",
  sessionTimesConfirmed: true,
};

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: "f1-2026-las-vegas:qualifying",
    roundId: round.id,
    series: "f1",
    type: "qualifying",
    name: "Qualifying",
    startsAt: "2026-11-21T04:00:00Z",
    endsAt: "2026-11-21T05:00:00Z",
    endIsEstimated: false,
    status: "scheduled",
    ...overrides,
  };
}

const now = new Date("2026-11-01T12:00:00Z");

function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n");
}

function calendar(entries: SessionWithContext[], revisions = new Map()) {
  return buildCalendar({ name: "F1 sessions · motorsportsinfo.app", description: "Test", entries, revisions, now });
}

describe("escapeText", () => {
  it("escapes backslash, semicolon, comma and newlines", () => {
    expect(escapeText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });
});

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds at 75 octets with a leading space on continuation lines", () => {
    const line = `DESCRIPTION:${"x".repeat(200)}`;
    const folded = foldLine(line);
    const physical = folded.split("\r\n");
    expect(physical.length).toBeGreaterThan(1);
    for (const [i, p] of physical.entries()) {
      expect(Buffer.byteLength(p, "utf8")).toBeLessThanOrEqual(75);
      if (i > 0) expect(p.startsWith(" ")).toBe(true);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("never splits a multi-byte character", () => {
    const line = `SUMMARY:${"·é🏁".repeat(40)}`;
    const physical = foldLine(line).split("\r\n");
    for (const p of physical) {
      expect(Buffer.byteLength(p, "utf8")).toBeLessThanOrEqual(75);
      expect(p).not.toContain("�");
      // Each physical line must be valid on its own (no lone surrogates).
      expect(Buffer.from(p, "utf8").toString("utf8")).toBe(p);
    }
    expect(foldLine(line).replace(/\r\n /g, "")).toBe(line);
  });
});

describe("formatIcsDate", () => {
  it("formats UTC DATE-TIME", () => {
    expect(formatIcsDate("2026-11-21T04:00:00Z")).toBe("20261121T040000Z");
    expect(formatIcsDate(new Date("2026-01-02T03:04:05.678Z"))).toBe("20260102T030405Z");
  });
});

describe("buildCalendar", () => {
  it("writes a VCALENDAR with refresh hints and CRLF line endings", () => {
    const ics = calendar([]);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    const lines = unfold(ics);
    expect(lines).toContain("X-WR-CALNAME:F1 sessions · motorsportsinfo.app");
    expect(lines).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
    expect(lines).toContain("X-PUBLISHED-TTL:PT1H");
    expect(lines).toContain("METHOD:PUBLISH");
  });

  it("writes one VEVENT per Session with a stable UID, UTC times, summary, location and link", () => {
    const ics = calendar([
      { session: session(), round, circuit },
      { session: session({ id: "f1-2026-las-vegas:race", type: "race", name: "Race" }), round, circuit },
    ]);
    const lines = unfold(ics);
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(2);
    expect(lines).toContain("UID:f1-2026-las-vegas:qualifying@motorsportsinfo.app");
    expect(lines).toContain("UID:f1-2026-las-vegas:race@motorsportsinfo.app");
    expect(lines).toContain("DTSTART:20261121T040000Z");
    expect(lines).toContain("DTEND:20261121T050000Z");
    expect(lines).toContain("DTSTAMP:20261101T120000Z");
    expect(lines).toContain("SUMMARY:F1 · Las Vegas Grand Prix · Qualifying");
    expect(lines).toContain("LOCATION:Las Vegas Strip Circuit\\, Las Vegas\\, United States");
    expect(lines).toContain("URL:https://motorsportsinfo.app/f1");
    expect(lines.find((l) => l.startsWith("DESCRIPTION:Session times"))).toBe(
      "DESCRIPTION:Session times and weather: https://motorsportsinfo.app/f1",
    );
    expect(lines).toContain("STATUS:CONFIRMED");
    expect(lines).toContain("SEQUENCE:0");
    expect(lines.some((l) => l.startsWith("LAST-MODIFIED"))).toBe(false);
  });

  it("marks cancelled Sessions with STATUS:CANCELLED", () => {
    const lines = unfold(calendar([{ session: session({ status: "cancelled" }), round, circuit }]));
    expect(lines).toContain("STATUS:CANCELLED");
    expect(lines).toContain("SUMMARY:F1 · Las Vegas Grand Prix · Qualifying (cancelled)");
    expect(lines.findLast((l) => l.startsWith("DESCRIPTION:"))).toContain("This Session has been cancelled.\\n");
  });

  it("marks Sessions of Rounds with unconfirmed times as TENTATIVE", () => {
    const lines = unfold(calendar([{ session: session(), round: { ...round, sessionTimesConfirmed: false }, circuit }]));
    expect(lines).toContain("STATUS:TENTATIVE");
  });

  it("uses Schedule Change revisions for SEQUENCE and LAST-MODIFIED", () => {
    const revisions = new Map([[session().id, { sequence: 2, lastModified: new Date("2026-10-30T08:15:00Z") }]]);
    const lines = unfold(calendar([{ session: session(), round, circuit }], revisions));
    expect(lines).toContain("SEQUENCE:2");
    expect(lines).toContain("LAST-MODIFIED:20261030T081500Z");
  });

  it("escapes text values and keeps every physical line within 75 octets", () => {
    const weird = { ...round, name: "Grand Prix; of Somewhere, Really\\Long Name With Plenty Of Words To Force Folding" };
    const ics = calendar([{ session: session({ name: "Qualifying, Part 1" }), round: weird, circuit }]);
    for (const physical of ics.split("\r\n")) expect(Buffer.byteLength(physical, "utf8")).toBeLessThanOrEqual(75);
    const summary = unfold(ics).find((l) => l.startsWith("SUMMARY:"));
    expect(summary).toBe(
      "SUMMARY:F1 · Grand Prix\\; of Somewhere\\, Really\\\\Long Name With Plenty Of Words To Force Folding · Qualifying\\, Part 1",
    );
  });
});
