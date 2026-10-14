// Schema.org structured data (JSON-LD) for the pages. Pure builders; <JsonLd> renders them server-side.
// Only facts the site actually has: no offers, performers or images that don't exist.
import { SERIES } from "@/domain/series";
import type { Circuit, Round, SeriesId, Session } from "@/domain/types";
import { absoluteUrl, SITE_DESCRIPTION, SITE_LOGO_PATH, SITE_NAME, SITE_URL } from "@/lib/site";
import { isoWithOffset } from "@/lib/track-time";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonLdObject = { [key: string]: Json };

const SCHEMA = "https://schema.org";
const WEBSITE_ID = `${SITE_URL}/#website`;
const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/** JSON for a <script type="application/ld+json">: `<`, `>`, `&` and line separators escaped so no string can end the script. */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replaceAll(String.fromCharCode(0x2028), "\\u2028")
    .replaceAll(String.fromCharCode(0x2029), "\\u2029");
}

/** Home page: the site and who runs it. */
export function homeJsonLd(): JsonLdObject {
  return {
    "@context": SCHEMA,
    "@graph": [
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        name: SITE_NAME,
        url: absoluteUrl("/"),
        description: SITE_DESCRIPTION,
        inLanguage: "en-GB",
        publisher: { "@id": ORGANIZATION_ID },
      },
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: SITE_NAME,
        url: absoluteUrl("/"),
        logo: { "@type": "ImageObject", url: absoluteUrl(SITE_LOGO_PATH), width: 512, height: 512 },
      },
    ],
  };
}

/** Home › F1 */
export function seriesBreadcrumbJsonLd(series: SeriesId): JsonLdObject {
  return {
    "@context": SCHEMA,
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: SERIES[series].shortName, item: absoluteUrl(`/${series}`) },
    ],
  };
}

/** "Marina Bay, Singapore" → locality "Marina Bay", country "Singapore". */
function postalAddress(location: string): JsonLdObject {
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { "@type": "PostalAddress", addressLocality: location };
  const country = parts.pop()!;
  return { "@type": "PostalAddress", addressLocality: parts.join(", "), addressCountry: country };
}

function place(circuit: Circuit): JsonLdObject {
  return {
    "@type": "Place",
    name: circuit.name,
    address: postalAddress(circuit.location),
    geo: { "@type": "GeoCoordinates", latitude: circuit.lat, longitude: circuit.lon },
  };
}

const SPORT: Record<SeriesId, string> = {
  f1: "Formula racing",
  f2: "Formula racing",
  f3: "Formula racing",
  wec: "Endurance racing",
  fe: "Formula racing",
  indycar: "Open-wheel racing",
  motogp: "Motorcycle racing",
  "f1-academy": "Formula racing",
  wrc: "Rallying",
  imsa: "Endurance racing",
  nascar: "Stock car racing",
  "gtwc-europe": "Sports car racing",
  dtm: "Sports car racing",
  "super-gt": "Sports car racing",
};

const isNumbered = (round: Round) => /^Round \d+$/.test(round.name);

/** "Baku" from the Circuit's "Baku, Azerbaijan". */
export function circuitLocality(circuit: Circuit): string {
  return circuit.location.split(",")[0]?.trim() || circuit.name;
}

/** The Round's name, with the place where the name is only a number ("Round 13 · Baku"). */
export function roundShortName(round: Round, circuit: Circuit): string {
  return isNumbered(round) ? `${round.name} · ${circuitLocality(circuit)}` : round.name;
}

/** Like roundShortName, with the Series in front of a numbered Round ("F2 Round 13 · Baku"). */
export function roundDisplayName(series: SeriesId, round: Round, circuit: Circuit): string {
  return isNumbered(round) ? `${SERIES[series].shortName} ${roundShortName(round, circuit)}` : round.name;
}

/** "F1 Singapore Grand Prix 2026", "F2 Baku 2026 (Round 13)" — the event name search engines show. */
export function roundEventName(series: SeriesId, round: Round, circuit: Circuit): string {
  const short = SERIES[series].shortName;
  if (isNumbered(round)) return `${short} ${circuitLocality(circuit)} ${round.season} (${round.name})`;
  const name = round.name.startsWith(short) ? round.name : `${short} ${round.name}`;
  return name.includes(String(round.season)) ? name : `${name} ${round.season}`;
}

const status = (cancelled: boolean) => `${SCHEMA}/${cancelled ? "EventCancelled" : "EventScheduled"}`;

export interface RoundJsonLdInput {
  series: SeriesId;
  round: Round;
  circuit: Circuit;
  sessions: Session[];
  /** The Series page's meta description. */
  description: string;
  /** Absolute URL of the Series' Open Graph image. */
  imageUrl: string;
}

/**
 * The Featured Round as a SportsEvent with each Session as a sub-event. Session times only when they
 * are confirmed (TBC times are placeholders); the Round then uses its Track Time dates.
 */
export function roundJsonLd({ series, round, circuit, sessions, description, imageUrl }: RoundJsonLdInput): JsonLdObject {
  const info = SERIES[series];
  const url = absoluteUrl(`/${series}`);
  const location = place(circuit);
  const organizer: JsonLdObject = { "@type": "SportsOrganization", name: info.name };
  const withTimes = round.sessionTimesConfirmed && sessions.length > 0;
  const live = sessions.filter((s) => s.status !== "cancelled");
  const allCancelled = sessions.length > 0 && live.length === 0;
  const timed = withTimes ? (live.length > 0 ? live : sessions) : [];
  const first = timed.reduce<Session | null>((a, s) => (!a || s.startsAt < a.startsAt ? s : a), null);
  const last = timed.reduce<Session | null>((a, s) => (!a || s.endsAt > a.endsAt ? s : a), null);
  const baseName = roundDisplayName(series, round, circuit);

  const event: JsonLdObject = {
    "@context": SCHEMA,
    "@type": "SportsEvent",
    "@id": `${url}#${round.id}`,
    name: roundEventName(series, round, circuit),
    description,
    url,
    image: [imageUrl],
    sport: SPORT[series],
    startDate: first ? isoWithOffset(first.startsAt, circuit.timeZone) : round.startDate,
    endDate: last ? isoWithOffset(last.endsAt, circuit.timeZone) : round.endDate,
    eventStatus: status(allCancelled),
    eventAttendanceMode: `${SCHEMA}/OfflineEventAttendanceMode`,
    location,
    organizer,
  };

  if (withTimes) {
    event.subEvent = sessions.map((s) => ({
      "@type": "SportsEvent",
      name: `${baseName} – ${s.name}`,
      url,
      sport: SPORT[series],
      startDate: isoWithOffset(s.startsAt, circuit.timeZone),
      endDate: isoWithOffset(s.endsAt, circuit.timeZone),
      eventStatus: status(s.status === "cancelled"),
      eventAttendanceMode: `${SCHEMA}/OfflineEventAttendanceMode`,
      location,
      organizer,
    }));
  }
  return event;
}
