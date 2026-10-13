import { describe, expect, it } from "vitest";
import { SPECIAL_EVENTS, type SpecialEventEntry } from "@/data/special-events";
import { getSpecialEvent, listSpecialEventAnnouncements, specialEventAnnouncedUntil, toSpecialEvent } from "./special-events";

const entry: SpecialEventEntry = {
  slug: "test-event",
  season: 2026,
  name: "Test Event",
  championship: "Test Championship",
  summary: "A test.",
  circuitId: "portimao",
  startDate: "2026-10-16",
  endDate: "2026-10-17",
  sessions: [
    { key: "Race", name: "Race", startsAt: "2026-10-17T16:00:00Z", endsAt: "2026-10-17T19:00:00Z" },
    { key: "Free Practice 1", name: "Free Practice 1", startsAt: "2026-10-16T07:45:00Z", minutes: 90 },
  ],
  source: { label: "Source", href: "https://example.com" },
  watch: null,
  announcement: "Something special",
  note: "test",
};

describe("toSpecialEvent", () => {
  it("builds Session ids from the event id, orders Sessions and estimates missing ends", () => {
    const event = toSpecialEvent(entry);
    expect(event.id).toBe("special-2026-test-event");
    expect(event.circuit.timeZone).toBe("Europe/Lisbon");
    expect(event.sessions.map((s) => s.id)).toEqual(["special-2026-test-event:free-practice-1", "special-2026-test-event:race"]);
    expect(event.sessions[0]).toMatchObject({ series: null, endsAt: "2026-10-16T09:15:00.000Z", endIsEstimated: true, status: "scheduled" });
    expect(event.sessions[1]).toMatchObject({ endsAt: "2026-10-17T19:00:00.000Z", endIsEstimated: false });
  });

  it("rejects an unknown Circuit", () => {
    expect(() => toSpecialEvent({ ...entry, circuitId: "nowhere" })).toThrow(/unknown Circuit/);
  });

  it("announces the event until 2 hours after its final Session ends", () => {
    expect(specialEventAnnouncedUntil(toSpecialEvent(entry))).toBe("2026-10-17T21:00:00.000Z");
  });
});

describe("the hand-entered Special Events", () => {
  it("all resolve, with unique slugs and Sessions inside their dates", () => {
    const slugs = SPECIAL_EVENTS.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const e of SPECIAL_EVENTS) {
      const event = getSpecialEvent(e.slug)!;
      expect(event.sessions.length).toBeGreaterThan(0);
      for (const s of event.sessions) {
        const day = new Intl.DateTimeFormat("en-CA", { timeZone: event.circuit.timeZone }).format(new Date(s.startsAt));
        expect(day >= event.startDate && day <= event.endDate).toBe(true);
      }
    }
  });

  it("puts Portimão's race at 17:00 track time on Saturday 17 October", () => {
    const race = getSpecialEvent("verstappen-portimao")!.sessions.at(-1)!;
    expect(race.name).toBe("Race");
    expect(new Date(race.startsAt).toLocaleString("en-GB", { timeZone: "Europe/Lisbon", weekday: "short", hour: "2-digit", minute: "2-digit" })).toBe(
      "Sat 17:00",
    );
  });

  it("links each announcement to its page", () => {
    expect(listSpecialEventAnnouncements()).toContainEqual({
      id: "special-2026-verstappen-portimao",
      href: "/special/verstappen-portimao",
      text: "Max Verstappen races GT3 at Portimão this weekend",
      until: "2026-10-17T21:00:00.000Z",
    });
  });
});
