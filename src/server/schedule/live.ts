// Read path without a database (local dev): fetch the sources live with the same parsers,
// apply Schedule Overrides, and memoise in-process for 15 minutes.
import { SCHEDULE_OVERRIDES } from "@/data/overrides";
import type { SeriesId } from "@/domain/types";
import { isIdOfSeries } from "./normalise";
import { applyOverrides } from "./overrides";
import { fetchSeriesSchedule } from "./sources";
import { MINUTE } from "./time";
import type { RoundWithSessions } from "./types";

export const LIVE_MEMO_MS = 15 * MINUTE;

interface Entry {
  fetchedAt: number;
  promise: Promise<RoundWithSessions[]>;
}

const memo = new Map<SeriesId, Entry>();
const lastGood = new Map<SeriesId, RoundWithSessions[]>();

async function load(series: SeriesId): Promise<RoundWithSessions[]> {
  const schedule = await fetchSeriesSchedule(series);
  for (const p of schedule.problems) console.error(`[schedule:${series}] ${p}`);
  for (const w of schedule.warnings) console.warn(`[schedule:${series}] ${w}`);
  const overrides = SCHEDULE_OVERRIDES.filter((o) => isIdOfSeries(o.sessionId, series));
  const { rounds, warnings } = applyOverrides(schedule.rounds, overrides);
  for (const w of warnings) console.warn(`[schedule:${series}] ${w}`);
  return rounds;
}

export function getLiveSchedule(series: SeriesId): Promise<RoundWithSessions[]> {
  const cached = memo.get(series);
  if (cached && Date.now() - cached.fetchedAt < LIVE_MEMO_MS) return cached.promise;

  const promise = load(series).then(
    (rounds) => {
      lastGood.set(series, rounds);
      return rounds;
    },
    (error: unknown) => {
      memo.delete(series); // retry on the next read
      const stale = lastGood.get(series);
      if (stale) {
        console.error(`[schedule:${series}] live fetch failed; serving the last good copy`, error);
        return stale;
      }
      throw error;
    },
  );
  memo.set(series, { fetchedAt: Date.now(), promise });
  return promise;
}
