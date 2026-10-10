import { describe, expect, it } from "vitest";
import {
  homeJsonLd,
  roundEventName,
  roundJsonLd,
  roundShortName,
  serializeJsonLd,
  seriesBreadcrumbJsonLd,
  type JsonLdObject,
} from "./json-ld";
import { singapore, singaporeRound, singaporeSessions } from "./test-fixtures";

const base = {
  series: "f1" as const,
  round: singaporeRound,
  circuit: singapore,
  sessions: singaporeSessions,
  description: "Formula 1 Singapore Grand Prix session times.",
  imageUrl: "https://motorsportsinfo.app/f1/opengraph-image",
};

const subEvents = (event: JsonLdObject) => event.subEvent as JsonLdObject[];

describe("roundJsonLd", () => {
  it("describes the Featured Round as a SportsEvent at the Circuit", () => {
    const event = roundJsonLd(base);
    expect(event).toMatchObject({
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: "F1 Singapore Grand Prix 2026",
      url: "https://motorsportsinfo.app/f1",
      image: ["https://motorsportsinfo.app/f1/opengraph-image"],
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      organizer: { "@type": "SportsOrganization", name: "Formula 1" },
      location: {
        "@type": "Place",
        name: "Marina Bay Street Circuit",
        address: { "@type": "PostalAddress", addressLocality: "Marina Bay", addressCountry: "Singapore" },
        geo: { "@type": "GeoCoordinates", latitude: 1.2914, longitude: 103.864 },
      },
    });
    // No made-up offers or performers.
    expect(event).not.toHaveProperty("offers");
    expect(event).not.toHaveProperty("performer");
  });

  it("writes start and end in Track Time with the Circuit's UTC offset", () => {
    const event = roundJsonLd(base);
    expect(event.startDate).toBe("2026-10-09T17:30:00+08:00");
    expect(event.endDate).toBe("2026-10-11T22:00:00+08:00");
    expect(subEvents(event)[3]).toMatchObject({
      "@type": "SportsEvent",
      name: "Singapore Grand Prix – Qualifying",
      startDate: "2026-10-10T21:00:00+08:00",
      endDate: "2026-10-10T22:00:00+08:00",
      eventStatus: "https://schema.org/EventScheduled",
    });
  });

  it("uses negative offsets west of Greenwich", () => {
    const vegas = { ...singapore, name: "Las Vegas Strip Circuit", location: "Las Vegas, United States", timeZone: "America/Los_Angeles" };
    const event = roundJsonLd({ ...base, circuit: vegas });
    expect(event.startDate).toBe("2026-10-09T02:30:00-07:00");
  });

  it("marks a cancelled Session, and the Round when every Session is cancelled", () => {
    const withCancelled = singaporeSessions.map((s) => (s.id.endsWith(":fp3") ? { ...s, status: "cancelled" as const } : s));
    const event = roundJsonLd({ ...base, sessions: withCancelled });
    expect(event.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(subEvents(event)[2]).toMatchObject({ name: "Singapore Grand Prix – Free Practice 3", eventStatus: "https://schema.org/EventCancelled" });

    const allCancelled = roundJsonLd({ ...base, sessions: singaporeSessions.map((s) => ({ ...s, status: "cancelled" as const })) });
    expect(allCancelled.eventStatus).toBe("https://schema.org/EventCancelled");
  });

  it("leaves Session times out while they are TBC and uses the Round's dates", () => {
    const event = roundJsonLd({ ...base, round: { ...singaporeRound, sessionTimesConfirmed: false } });
    expect(event.startDate).toBe("2026-10-09");
    expect(event.endDate).toBe("2026-10-11");
    expect(event).not.toHaveProperty("subEvent");
  });

  it("names numbered Rounds by Series and place", () => {
    const baku = { ...singapore, location: "Baku, Azerbaijan" };
    const round = { ...singaporeRound, series: "f2" as const, name: "Round 11" };
    expect(roundEventName("f2", round, baku)).toBe("F2 Baku 2026 (Round 11)");
    expect(roundShortName(round, baku)).toBe("Round 11 · Baku");
    const event = roundJsonLd({ ...base, series: "f2", round, circuit: baku });
    expect(subEvents(event)[0].name).toBe("F2 Round 11 · Baku – Free Practice 1");
  });
});

describe("homeJsonLd and breadcrumbs", () => {
  it("describes the WebSite and its Organization with the app icon as logo", () => {
    const graph = homeJsonLd()["@graph"] as JsonLdObject[];
    expect(graph.map((n) => n["@type"])).toEqual(["WebSite", "Organization"]);
    expect(graph[0]).toMatchObject({ name: "motorsportsinfo.app", url: "https://motorsportsinfo.app/" });
    expect(graph[1]).toMatchObject({ logo: { url: "https://motorsportsinfo.app/icons/icon-512.png" } });
  });

  it("lists Home › Series", () => {
    expect(seriesBreadcrumbJsonLd("motogp").itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://motorsportsinfo.app/" },
      { "@type": "ListItem", position: 2, name: "MotoGP", item: "https://motorsportsinfo.app/motogp" },
    ]);
  });
});

describe("serializeJsonLd", () => {
  it("escapes characters that could close the script element, and still parses back", () => {
    const data = { name: "</script><script>alert(1)</script> & co", note: `a${String.fromCharCode(0x2028)}b` };
    const out = serializeJsonLd(data);
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain("&");
    expect(out).not.toContain(String.fromCharCode(0x2028));
    expect(JSON.parse(out)).toEqual(data);
  });

  it("serialises a real Round to valid JSON", () => {
    const parsed = JSON.parse(serializeJsonLd([roundJsonLd(base), seriesBreadcrumbJsonLd("f1")]));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].subEvent).toHaveLength(5);
  });
});
