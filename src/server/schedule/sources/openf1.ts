// F1 primary source: OpenF1 (https://openf1.org). Free tier: 3 req/s, 30 req/min. CC BY-NC-SA 4.0.
import type { SessionType } from "@/domain/types";
import { getCircuitTimeZoneDate } from "./dates";
import { getJson, type SourceContext } from "./http";
import type { RawRound, RawSession } from "../types";

export interface OpenF1Meeting {
  meeting_key: number;
  meeting_name: string;
  location: string;
  country_name: string;
  circuit_short_name: string;
  date_start: string;
  date_end: string;
  gmt_offset: string;
  year: number;
  is_cancelled?: boolean;
}

export interface OpenF1Session {
  session_key: number;
  session_type: string;
  session_name: string;
  date_start: string;
  date_end: string | null;
  meeting_key: number;
  circuit_short_name: string;
  location: string;
  gmt_offset: string;
  year: number;
  is_cancelled?: boolean;
}

const BASE = "https://api.openf1.org/v1";

/**
 * OpenF1 publishes next season's calendar with placeholder Sessions (every Practice 1 at 12:00, and so on).
 * Those carry synthetic session keys far above real ones (e.g. 92713101 vs 11378). Real keys are
 * sequential and will not reach this for decades, so such a Round is treated as "Times TBC".
 */
const PROVISIONAL_SESSION_KEY = 10_000_000;

export function openF1SessionType(name: string): SessionType | null {
  const n = name.trim().toLowerCase();
  if (/^(free )?practice\s*\d*$/.test(n) || /^fp\d$/.test(n)) return "practice";
  if (n === "sprint qualifying" || n === "sprint shootout") return "sprint-qualifying";
  if (n === "sprint" || n === "sprint race") return "sprint";
  if (n === "qualifying") return "qualifying";
  if (n === "race" || n === "grand prix") return "race";
  return null;
}

function isTesting(meeting: OpenF1Meeting): boolean {
  return /testing/i.test(meeting.meeting_name);
}

export function parseOpenF1(meetings: OpenF1Meeting[], sessions: OpenF1Session[]): RawRound[] {
  const byMeeting = new Map<number, OpenF1Session[]>();
  for (const s of sessions) {
    const list = byMeeting.get(s.meeting_key) ?? [];
    list.push(s);
    byMeeting.set(s.meeting_key, list);
  }

  return meetings
    .filter((m) => !isTesting(m))
    .map((m): RawRound => {
      const own = byMeeting.get(m.meeting_key) ?? [];
      const provisional = own.length === 0 || own.some((s) => s.session_key >= PROVISIONAL_SESSION_KEY);
      // Circuit hints: never the meeting name or country (the 2026 "Bahrain Grand Prix" ran at Sepang).
      const circuitHints = [m.circuit_short_name, m.location];
      const rawSessions: RawSession[] = own.map((s) => ({
        key: s.session_name,
        name: s.session_name,
        type: openF1SessionType(s.session_name),
        startsAt: s.date_start,
        endsAt: s.date_end,
        cancelled: s.is_cancelled === true || m.is_cancelled === true,
      }));
      return {
        season: m.year,
        name: m.meeting_name,
        circuitHints,
        timesConfirmed: !provisional,
        sessions: provisional ? [] : rawSessions,
        startDate: getCircuitTimeZoneDate(circuitHints, m.date_start),
        endDate: getCircuitTimeZoneDate(circuitHints, m.date_end),
        sourceRef: `OpenF1 meeting ${m.meeting_key}`,
      };
    });
}

export async function fetchOpenF1Season(ctx: SourceContext, year: number): Promise<RawRound[]> {
  const meetings = await getJson<unknown>(ctx, `${BASE}/meetings?year=${year}`);
  await ctx.sleep(400);
  const sessions = await getJson<unknown>(ctx, `${BASE}/sessions?year=${year}`);
  // OpenF1 answers {"detail": "No results found."} for a year with no data.
  if (!Array.isArray(meetings) || !Array.isArray(sessions)) return [];
  return parseOpenF1(meetings as OpenF1Meeting[], sessions as OpenF1Session[]);
}
