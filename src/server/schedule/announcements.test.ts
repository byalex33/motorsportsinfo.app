import { describe, expect, it } from "vitest";
import { CELEBRATIONS } from "@/data/announcements";
import { listAnnouncements } from "./announcements";

describe("listAnnouncements", () => {
  it("includes Special Events and every Celebration, ending soonest first, with unique ids", () => {
    const all = listAnnouncements();
    expect(all.some((a) => a.kind === "special-event")).toBe(true);
    expect(all.filter((a) => a.kind === "celebration")).toHaveLength(CELEBRATIONS.length);
    const ends = all.map((a) => Date.parse(a.until));
    expect(ends).toEqual([...ends].sort((a, b) => a - b));
    expect(new Set(all.map((a) => a.id)).size).toBe(all.length);
  });

  it("gives every Celebration a valid end time, an internal link and a highlight from its own text", () => {
    for (const c of CELEBRATIONS) {
      expect(Number.isNaN(Date.parse(c.until))).toBe(false);
      expect(c.link.href.startsWith("/")).toBe(true);
      if (c.highlight) expect(c.text).toContain(c.highlight);
    }
  });
});
