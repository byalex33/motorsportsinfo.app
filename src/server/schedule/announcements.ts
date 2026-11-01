// The strip under the header: each Special Event's announcement and the hand-entered Celebrations
// (src/data/announcements.ts).
import { CELEBRATIONS, type CelebrationEntry } from "@/data/announcements";
import { listSpecialEventAnnouncements } from "./special-events";

/** What the site-wide announcement needs: plain data, safe to pass to a client component. */
export interface Announcement {
  /** A dismissal is remembered against it. */
  id: string;
  kind: "special-event" | "celebration";
  /** The chip's word, e.g. "Special" or "Champion". */
  chip: string;
  text: string;
  /** Part of `text` that glows and sparkles; null for none. */
  highlight: string | null;
  href: string;
  linkLabel: string;
  /** A [data-accent] rule in src/app/globals.css, or null for the site's purple. */
  accent: string | null;
  /** Confetti colours fired when the strip opens; empty for none. */
  confetti: string[];
  /** ISO UTC: the announcement hides itself from then on. */
  until: string;
}

export function toCelebrationAnnouncement(entry: CelebrationEntry): Announcement {
  return {
    id: entry.id,
    kind: "celebration",
    chip: entry.chip,
    text: entry.text,
    highlight: entry.highlight,
    href: entry.link.href,
    linkLabel: entry.link.label,
    accent: entry.accent,
    confetti: entry.confetti,
    until: new Date(entry.until).toISOString(),
  };
}

/**
 * Every announcement, the one ending soonest first; the strip shows the first that has not ended. Ended ones are
 * included: the static layout can't read the clock, so the strip hides each once `until` has passed.
 */
export function listAnnouncements(): Announcement[] {
  return [...listSpecialEventAnnouncements(), ...CELEBRATIONS.map(toCelebrationAnnouncement)].sort(
    (a, b) => Date.parse(a.until) - Date.parse(b.until),
  );
}
