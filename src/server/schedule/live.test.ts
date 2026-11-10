import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeadlineError } from "@/server/deadline";
import type { SourceSchedule } from "./types";

vi.mock("@/data/overrides", () => ({ SCHEDULE_OVERRIDES: [] }));
vi.mock("./sources", () => ({ fetchSeriesSchedule: vi.fn() }));

const { fetchSeriesSchedule } = await import("./sources");
const fetchMock = vi.mocked(fetchSeriesSchedule);

function schedule(name: string): SourceSchedule {
  return {
    series: "dtm",
    source: "test",
    isFallback: false,
    completeSeasons: [2026],
    problems: [],
    warnings: [],
    rounds: [
      {
        round: {
          id: "dtm-2026-hockenheim",
          series: "dtm",
          season: 2026,
          slug: "hockenheim",
          name,
          circuitId: "hockenheim",
          startDate: "2026-10-03",
          endDate: "2026-10-04",
          sessionTimesConfirmed: false,
        },
        sessions: [],
      },
    ],
  };
}

const names = (rounds: { round: { name: string } }[]) => rounds.map((r) => r.round.name);

const { getLiveSchedule, LIVE_CRAWL_MS, LIVE_FAILURE_MEMO_MS, LIVE_MEMO_MS, LIVE_WAIT_MS } = await import("./live");

// The memo is per Series and lives for the process, so each test uses its own Series.
describe("getLiveSchedule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("memoises a good copy for 15 minutes", async () => {
    fetchMock.mockResolvedValue(schedule("First"));
    expect(names(await getLiveSchedule("dtm"))).toEqual(["First"]);
    vi.advanceTimersByTime(LIVE_MEMO_MS - 1000);
    expect(names(await getLiveSchedule("dtm"))).toEqual(["First"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the stale copy at once and refreshes it in the background, once", async () => {
    fetchMock.mockResolvedValueOnce(schedule("Old"));
    await getLiveSchedule("wrc");
    vi.advanceTimersByTime(LIVE_MEMO_MS + 1000);

    let finish!: (s: SourceSchedule) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    expect(names(await getLiveSchedule("wrc"))).toEqual(["Old"]);
    expect(names(await getLiveSchedule("wrc"))).toEqual(["Old"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    finish(schedule("New"));
    await vi.waitFor(async () => expect(names(await getLiveSchedule("wrc"))).toEqual(["New"]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not start another crawl within a minute of a failure", async () => {
    fetchMock.mockRejectedValue(new Error("All sources failed for dtm"));
    await expect(getLiveSchedule("imsa")).rejects.toThrow("All sources failed for dtm");
    await expect(getLiveSchedule("imsa")).rejects.toThrow("All sources failed for dtm");
    vi.advanceTimersByTime(LIVE_FAILURE_MEMO_MS - 1000);
    await expect(getLiveSchedule("imsa")).rejects.toThrow("All sources failed for dtm");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    fetchMock.mockResolvedValue(schedule("Back"));
    expect(names(await getLiveSchedule("imsa"))).toEqual(["Back"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps serving the stale copy after a failed refresh, without retrying for a minute", async () => {
    fetchMock.mockResolvedValueOnce(schedule("Old"));
    await getLiveSchedule("nascar");
    vi.advanceTimersByTime(LIVE_MEMO_MS + 1000);
    fetchMock.mockRejectedValue(new Error("down"));
    expect(names(await getLiveSchedule("nascar"))).toEqual(["Old"]);
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(names(await getLiveSchedule("nascar"))).toEqual(["Old"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up waiting after waitMs, and the crawl still fills the memo", async () => {
    let finish!: (s: SourceSchedule) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const pending = getLiveSchedule("super-gt", { waitMs: LIVE_WAIT_MS });
    const result = expect(pending).rejects.toBeInstanceOf(DeadlineError);
    await vi.advanceTimersByTimeAsync(LIVE_WAIT_MS);
    await result;

    finish(schedule("Late"));
    await vi.waitFor(async () => expect(names(await getLiveSchedule("super-gt", { waitMs: LIVE_WAIT_MS }))).toEqual(["Late"]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts a crawl that runs past its own deadline", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_series, _now, ctx) => {
      signal = ctx?.signal;
      return new Promise(() => {});
    });
    const pending = getLiveSchedule("f2");
    const result = expect(pending).rejects.toBeInstanceOf(DeadlineError);
    await vi.advanceTimersByTimeAsync(LIVE_CRAWL_MS);
    await result;
    expect(signal?.aborted).toBe(true);
  });
});
