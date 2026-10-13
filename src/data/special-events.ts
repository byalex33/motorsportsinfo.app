// Special Events: one-off Rounds outside the covered Series, entered by hand. Each gets a page at
// /special/{slug} and the site-wide announcement until it finishes. Remove an entry once it is long over.
// Times are ISO 8601 UTC; give the source for each in `note`.

export interface SpecialEventSessionEntry {
  /** Text the Session id slug is made from, e.g. "Free Practice 1" → "free-practice-1". */
  key: string;
  name: string;
  startsAt: string;
  /** Omit when the source gives no end time: `minutes` then sets an estimated end. */
  endsAt?: string;
  minutes?: number;
}

export interface SpecialEventEntry {
  slug: string;
  season: number;
  name: string;
  championship: string;
  summary: string;
  /** An id from src/data/circuits.ts. */
  circuitId: string;
  startDate: string;
  endDate: string;
  sessions: SpecialEventSessionEntry[];
  source: { label: string; href: string };
  watch: { label: string; href: string } | null;
  announcement: string;
  /** Where the times came from and when they were checked. */
  note: string;
}

export const SPECIAL_EVENTS: SpecialEventEntry[] = [
  {
    slug: "verstappen-portimao",
    season: 2026,
    name: "Max Verstappen at Portimão",
    championship: "GT World Challenge Europe · Endurance Cup finale",
    summary:
      "Between the Singapore and United States Grands Prix, Max Verstappen races the #3 Mercedes-AMG GT3 EVO of his own Verstappen Racing team with Chris Lulham and Ben Barnicoat, in a three-hour race against more than 60 GT3 cars.",
    circuitId: "portimao",
    startDate: "2026-10-16",
    endDate: "2026-10-17",
    sessions: [
      // 08:45 and 12:45 WEST (UTC+1). The timetable gives no end times for practice.
      { key: "Free Practice 1", name: "Free Practice 1", startsAt: "2026-10-16T07:45:00Z", minutes: 90 },
      { key: "Free Practice 2", name: "Free Practice 2", startsAt: "2026-10-16T11:45:00Z", minutes: 90 },
      // 17:55–19:05 WEST.
      { key: "Qualifying", name: "Qualifying", startsAt: "2026-10-16T16:55:00Z", endsAt: "2026-10-16T18:05:00Z" },
      // 17:00–20:00 WEST: three hours.
      { key: "Race", name: "Race", startsAt: "2026-10-17T16:00:00Z", endsAt: "2026-10-17T19:00:00Z" },
    ],
    source: { label: "GT World Challenge Europe", href: "https://www.gt-world-challenge-europe.com/event/255/portimao" },
    watch: { label: "Free on GT World's YouTube channel", href: "https://www.youtube.com/@GTWorld" },
    announcement: "Max Verstappen races GT3 at Portimão this weekend",
    note:
      "Checked 13 Oct 2026: gt-world-challenge-europe.com event page and live-coverage listing, motorsport.com; the race moved to Saturday evening (dailysportscar.com, 1 Aug 2026) to avoid the WEC clash.",
  },
];
