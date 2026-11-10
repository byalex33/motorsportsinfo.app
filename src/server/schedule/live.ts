// Read path without a database (local dev), or while it can't be read: fetch the sources live with the same
// parsers, apply Schedule Overrides, and memoise in-process for 15 minutes.
//
// Bounded so a database outage does not make every page request re-crawl every source: a stale copy is
// returned at once while one background crawl per Series refreshes it, a failed crawl is remembered for a
// minute, a crawl gives up after LIVE_CRAWL_MS, and a caller can cap its own wait (index.ts: LIVE_WAIT_MS).
import { SCHEDULE_OVERRIDES } from "@/data/overrides";
import type { SeriesId } from "@/domain/types";
import { withDeadline } from "@/server/deadline";
import { isIdOfSeries } from "./normalise";
import { applyOverrides } from "./overrides";
import { fetchSeriesSchedule } from "./sources";
import { defaultContext } from "./sources/http";
import { MINUTE } from "./time";
import type { RoundWithSessions } from "./types";

export const LIVE_MEMO_MS = 15 * MINUTE;
/** After a failed crawl, reads in this window get the failure (or the stale copy) without a new crawl. */
export const LIVE_FAILURE_MEMO_MS = MINUTE;
/** One whole crawl of a Series (WRC is about 50 sequential requests with polite delays). */
export const LIVE_CRAWL_MS = 2 * MINUTE;
/** How long a page request waits for a crawl when there is no copy to serve while the database is down. */
export const LIVE_WAIT_MS = 10_000;

interface State {
  good?: { rounds: RoundWithSessions[]; fetchedAt: number };
  crawl?: Promise<RoundWithSessions[]>;
  failure?: { error: unknown; at: number };
}

const states = new Map<SeriesId, State>();

async function load(series: SeriesId, signal: AbortSignal): Promise<RoundWithSessions[]> {
  const schedule = await fetchSeriesSchedule(series, new Date(), { ...defaultContext, signal });
  for (const p of schedule.problems) console.error(`[schedule:${series}] ${p}`);
  for (const w of schedule.warnings) console.warn(`[schedule:${series}] ${w}`);
  const overrides = SCHEDULE_OVERRIDES.filter((o) => isIdOfSeries(o.sessionId, series));
  const { rounds, warnings } = applyOverrides(schedule.rounds, overrides);
  for (const w of warnings) console.warn(`[schedule:${series}] ${w}`);
  return rounds;
}

function startCrawl(series: SeriesId, state: State): Promise<RoundWithSessions[]> {
  const controller = new AbortController();
  const crawl = withDeadline(load(series, controller.signal), LIVE_CRAWL_MS, `live ${series} schedule`)
    .then(
      (rounds) => {
        state.good = { rounds, fetchedAt: Date.now() };
        state.failure = undefined;
        return rounds;
      },
      (error: unknown) => {
        controller.abort(error); // stops the requests still in flight
        state.failure = { error, at: Date.now() };
        const stale = state.good ? "; serving the last good copy" : "";
        console.error(`[schedule:${series}] live fetch failed${stale}`, error);
        throw error;
      },
    )
    .finally(() => {
      if (state.crawl === crawl) state.crawl = undefined;
    });
  crawl.catch(() => {}); // a background refresh has no caller to report to
  state.crawl = crawl;
  return crawl;
}

/**
 * The Series' schedule from the sources. `waitMs` caps how long this call waits for a crawl when there is
 * no copy to serve; the crawl keeps going and fills the memo for later reads.
 */
export function getLiveSchedule(series: SeriesId, options: { waitMs?: number } = {}): Promise<RoundWithSessions[]> {
  let state = states.get(series);
  if (!state) states.set(series, (state = {}));
  const now = Date.now();
  if (state.good && now - state.good.fetchedAt < LIVE_MEMO_MS) return Promise.resolve(state.good.rounds);

  const failedRecently = !!state.failure && now - state.failure.at < LIVE_FAILURE_MEMO_MS;
  const crawl = state.crawl ?? (failedRecently ? null : startCrawl(series, state));
  if (state.good) return Promise.resolve(state.good.rounds);
  if (!crawl) return Promise.reject(state.failure!.error);
  return options.waitMs === undefined ? crawl : withDeadline(crawl, options.waitMs, `live ${series} schedule`);
}
