// Special Events: hand-entered one-off Rounds outside the covered Series (src/data/special-events.ts).
import { getCircuit } from "@/data/circuits";
import { SPECIAL_EVENTS, type SpecialEventEntry } from "@/data/special-events";
import { FEATURED_ROUND_GRACE_MINUTES } from "@/domain/series";
import type { SpecialEvent, SpecialEventSession } from "@/domain/types";
import type { Announcement } from "./announcements";
import { sessionId, slugify } from "./normalise";

const MINUTE = 60_000;

export function toSpecialEvent(entry: SpecialEventEntry): SpecialEvent {
  const circuit = getCircuit(entry.circuitId);
  if (!circuit) throw new Error(`Special Event ${entry.slug}: unknown Circuit "${entry.circuitId}"`);
  const id = `special-${entry.season}-${entry.slug}`;
  const sessions: SpecialEventSession[] = entry.sessions
    .map((s) => {
      const estimated = !s.endsAt;
      const endsAt = s.endsAt ?? new Date(Date.parse(s.startsAt) + (s.minutes ?? 60) * MINUTE).toISOString();
      return {
        id: sessionId(id, slugify(s.key)),
        roundId: id,
        series: null,
        name: s.name,
        startsAt: new Date(s.startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        endIsEstimated: estimated,
        status: "scheduled" as const,
      };
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return {
    id,
    slug: entry.slug,
    name: entry.name,
    championship: entry.championship,
    summary: entry.summary,
    circuit,
    startDate: entry.startDate,
    endDate: entry.endDate,
    sessions,
    source: entry.source,
    watch: entry.watch,
    announcement: entry.announcement,
    accent: entry.accent,
  };
}

/** Like a Featured Round, a Special Event is announced until 2 hours after its final Session ends. */
export function specialEventAnnouncedUntil(event: SpecialEvent): string {
  const end = Math.max(...event.sessions.map((s) => Date.parse(s.endsAt)));
  return new Date(end + FEATURED_ROUND_GRACE_MINUTES * MINUTE).toISOString();
}

/** Every Special Event, past ones included, in date order. */
export function listSpecialEvents(): SpecialEvent[] {
  return SPECIAL_EVENTS.map(toSpecialEvent).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function getSpecialEvent(slug: string): SpecialEvent | null {
  return listSpecialEvents().find((e) => e.slug === slug) ?? null;
}

/**
 * One announcement per Special Event, in date order. Finished ones are included: the static layout can't read
 * the clock, so the announcement hides itself once `until` has passed.
 */
export function listSpecialEventAnnouncements(): Announcement[] {
  return listSpecialEvents().map((event) => ({
    id: event.id,
    kind: "special-event",
    chip: "Special",
    text: event.announcement,
    highlight: null,
    href: `/special/${event.slug}`,
    linkLabel: "Session times & weather",
    accent: event.accent,
    confetti: [],
    until: specialEventAnnouncedUntil(event),
  }));
}
