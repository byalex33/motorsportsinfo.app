// Celebrations: hand-entered news for the strip under the header, such as a new champion. Each one shows until
// `until` and stays closed on a device once dismissed. Remove an entry once it is long over.
// Special Events are announced from src/data/special-events.ts, not here.

export interface CelebrationEntry {
  /** Stable id; a dismissal is remembered against it. */
  id: string;
  /** The chip's word, e.g. "Champion". */
  chip: string;
  /** The one line, without a final full stop. */
  text: string;
  /** Part of `text` that glows and sparkles, e.g. the champion's name; null for none. */
  highlight: string | null;
  link: { label: string; href: string };
  /** A [data-accent] rule in src/app/globals.css that colours the strip, or null for the site's purple. */
  accent: string | null;
  /** Confetti colours, fired once per visit when the strip opens; empty for none. */
  confetti: string[];
  /** ISO 8601 UTC: the strip hides itself from then on. */
  until: string;
}

export const CELEBRATIONS: CelebrationEntry[] = [
  {
    id: "celebration-2026-f1-champion-antonelli",
    chip: "Champion",
    text: "Kimi Antonelli is the 2026 Formula 1 World Champion",
    highlight: "Kimi Antonelli",
    link: { label: "F1 schedule", href: "/f1" },
    accent: "antonelli",
    confetti: ["#ffffff", "#23e4c5"],
    until: "2026-11-09T00:00:00Z",
  },
];
