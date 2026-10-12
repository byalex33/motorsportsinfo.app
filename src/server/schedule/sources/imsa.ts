// IMSA WeatherTech SportsCar Championship: IMSA's own calendar feed, published through ECAL (the "Add to
// Calendar" button on imsa.com). imsa.com itself refuses automated requests. ECAL only gives a feed address
// to a subscriber, so the address of the site's subscription is kept in the IMSA_CALENDAR_URL environment
// variable; without it the IMSA sync fails and is logged like any failed source.
//
// The feed is iCalendar: one VEVENT per on-track Session, with SUMMARY, DTSTART/DTEND and LOCATION.
// Events are grouped into Rounds by Circuit (matched from LOCATION, then SUMMARY) and date: an event
// within ROUND_GAP_DAYS of the previous one at the same Circuit belongs to the same Round.
import { matchCircuit } from "@/data/circuits";
import type { SessionType } from "@/domain/types";
import { getPage, API_USER_AGENT, type SourceContext } from "./http";
import { zoneOffsetMinutes } from "../time";
import type { RawRound, RawSession } from "../types";

export const IMSA_CALENDAR_ENV = "IMSA_CALENDAR_URL";

const ROUND_GAP_DAYS = 4;

export interface IcsEvent {
  uid: string | null;
  summary: string;
  location: string;
  /** ISO 8601 UTC. */
  start: string;
  /** ISO 8601 UTC, or null. */
  end: string | null;
  cancelled: boolean;
}

/** Unfolds continuation lines and unescapes text values (RFC 5545). */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

/** Wall-clock time in an IANA zone → UTC. */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let result = guess - zoneOffsetMinutes(timeZone, new Date(guess)) * 60_000;
  result = guess - zoneOffsetMinutes(timeZone, new Date(result)) * 60_000;
  return new Date(result);
}

/** A DTSTART/DTEND value with its parameters → ISO UTC, or null (all-day dates have no time). */
export function parseIcsDate(params: string, value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  if (m[7]) return new Date(Date.UTC(y, mo - 1, d, h, mi, s)).toISOString();
  const tzid = /TZID=([^;:]+)/i.exec(params)?.[1];
  try {
    return zonedToUtc(y, mo, d, h, mi, s, tzid ?? "UTC").toISOString();
  } catch {
    return null;
  }
}

export function parseIcs(ics: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: Record<string, { params: string; value: string }> | null = null;
  for (const line of unfold(ics)) {
    if (line === "BEGIN:VEVENT") current = {};
    else if (line === "END:VEVENT" && current) {
      const start = current.DTSTART ? parseIcsDate(current.DTSTART.params, current.DTSTART.value) : null;
      if (start) {
        events.push({
          uid: current.UID?.value ?? null,
          summary: unescapeText(current.SUMMARY?.value ?? ""),
          location: unescapeText(current.LOCATION?.value ?? ""),
          start,
          end: current.DTEND ? parseIcsDate(current.DTEND.params, current.DTEND.value) : null,
          cancelled: /cancel/i.test(current.STATUS?.value ?? ""),
        });
      }
      current = null;
    } else if (current) {
      const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(line);
      if (m && !current[m[1]]) current[m[1]] = { params: m[2], value: m[3] };
    }
  }
  return events;
}

export function imsaSessionType(summary: string): SessionType | null {
  const s = summary.toLowerCase();
  if (/qualif/.test(s)) return "qualifying";
  if (/practice|warm[\s-]?up/.test(s)) return "practice";
  if (/\brace\b|rolex 24|\bhours\b|petit le mans|grand prix|sprint|endurance|classic|battle on the bricks/.test(s)) return "race";
  return null;
}

/** "IMSA WeatherTech SportsCar Championship – Qualifying" → "Qualifying". */
function sessionName(summary: string, type: SessionType | null): string {
  const cleaned = summary
    .replace(/^(imsa\s+)?(weathertech\s+)?(sportscar\s+)?championship\s*[-–:|]?\s*/i, "")
    .replace(/^weathertech\s*[-–:|]\s*/i, "")
    .trim();
  return type === "race" ? "Race" : cleaned || summary;
}

export function parseImsaCalendar(ics: string, season: number): { rounds: RawRound[]; warnings: string[] } {
  const warnings: string[] = [];
  const events = parseIcs(ics)
    .filter((e) => Number(e.start.slice(0, 4)) === season)
    .sort((a, b) => a.start.localeCompare(b.start));

  const groups: { circuitId: string | null; hints: string[]; events: IcsEvent[] }[] = [];
  for (const event of events) {
    const hints = [event.location, event.summary].filter(Boolean);
    const circuit = matchCircuit(hints);
    const last = groups.at(-1);
    const lastStart = last ? Date.parse(last.events.at(-1)!.start) : 0;
    if (last && last.circuitId === (circuit?.id ?? null) && Date.parse(event.start) - lastStart <= ROUND_GAP_DAYS * 86_400_000) {
      last.events.push(event);
    } else {
      groups.push({ circuitId: circuit?.id ?? null, hints, events: [event] });
    }
  }

  const rounds = groups.map((group, i): RawRound => {
    const race = group.events.find((e) => imsaSessionType(e.summary) === "race");
    const sessions: RawSession[] = group.events.map((e) => {
      const type = imsaSessionType(e.summary);
      const name = sessionName(e.summary, type);
      return { key: name, name, type, startsAt: e.start, endsAt: e.end, cancelled: e.cancelled };
    });
    return {
      season,
      name: (race?.summary ?? group.events[0].summary).replace(/^imsa\s+/i, "").trim(),
      circuitHints: group.hints,
      ...(group.circuitId ? {} : { circuitId: null }),
      timesConfirmed: sessions.length > 0,
      sessions,
      sourceRef: `imsa calendar ${season} #${i + 1}`,
    };
  });
  return { rounds, warnings };
}

export async function fetchImsaSeason(ctx: SourceContext, year: number): Promise<{ rounds: RawRound[]; warnings: string[] }> {
  const url = process.env[IMSA_CALENDAR_ENV];
  if (!url) throw new Error(`${IMSA_CALENDAR_ENV} is not set`);
  const ics = await getPage(ctx, url.replace(/^webcal:/i, "https:"), API_USER_AGENT);
  return parseImsaCalendar(ics, year);
}
