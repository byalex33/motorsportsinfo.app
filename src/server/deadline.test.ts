import { afterEach, describe, expect, it, vi } from "vitest";
import { DeadlineError, withDeadline } from "./deadline";

describe("withDeadline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the value when the work finishes", async () => {
    await expect(withDeadline(Promise.resolve("ok"), 1_000, "work")).resolves.toBe("ok");
  });

  it("rejects when the work never settles, without waiting on it", async () => {
    vi.useFakeTimers();
    const pending = withDeadline(new Promise(() => {}), 8_000, "Open-Meteo").then(
      () => null,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(8_000);
    const error = await pending;
    expect(error).toBeInstanceOf(DeadlineError);
    expect(error).toMatchObject({ message: "Open-Meteo timed out after 8000ms" });
  });

  it("handles a rejection that arrives after the deadline", async () => {
    vi.useFakeTimers();
    let rejectWork: (error: Error) => void = () => {};
    const work = new Promise<string>((_, reject) => {
      rejectWork = reject;
    });
    const pending = withDeadline(work, 1_000, "upstream").then(
      () => "settled",
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await pending).toBeInstanceOf(DeadlineError);
    rejectWork(new Error("late"));
    await vi.runAllTimersAsync();
  });
});
