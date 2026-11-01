import { describe, expect, it } from "vitest";
import { CELEBRATIONS } from "@/data/announcements";
import { listAnnouncements } from "./announcements";

describe("listAnnouncements", () => {
  it("includes Special Events and Celebrations, ending soonest first, with unique ids", () => {
    const all = listAnnouncements();
    expect(all.some((a) => a.kind === "special-event")).toBe(true);
    expect(all.some((a) => a.kind === "celebration")).toBe(true);
    const ends = all.map((a) => Date.parse(a.until));
    expect(ends).toEqual([...ends].sort((a, b) => a - b));
    expect(new Set(all.map((a) => a.id)).size).toBe(all.length);
  });

  it("announces Kimi Antonelli's title in his teal and white confetti", () => {
    expect(listAnnouncements()).toContainEqual({
      id: "celebration-2026-f1-champion-antonelli",
      kind: "celebration",
      chip: "Champion",
      text: "Kimi Antonelli is the 2026 Formula 1 World Champion",
      highlight: "Kimi Antonelli",
      href: "/f1",
      linkLabel: "F1 schedule",
      accent: "antonelli",
      confetti: ["#ffffff", "#23e4c5"],
      until: "2026-11-09T00:00:00.000Z",
    });
  });

  it("gives every Celebration a valid end time, an internal link and a highlight from its own text", () => {
    for (const c of CELEBRATIONS) {
      expect(Number.isNaN(Date.parse(c.until))).toBe(false);
      expect(c.link.href.startsWith("/")).toBe(true);
      if (c.highlight) expect(c.text).toContain(c.highlight);
    }
  });
});
