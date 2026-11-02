// A hard limit that does not depend on AbortSignal. Next's patched fetch drops the caller's signal when
// it foreground-revalidates a stale fetch-cache entry for a `use cache` consumer, and a socket that
// never completes then holds the render until the prerender cache-fill limit (90% of
// staticPageGenerationTimeout, 54s by default) and fails the page.

export class DeadlineError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "DeadlineError";
  }
}

/**
 * Resolves with `promise`, or rejects after `ms` even when `promise` never settles. A later
 * rejection of `promise` is handled here, so abandoning it does not surface as unhandled.
 */
export function withDeadline<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineError(label, ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** One upstream read during rendering. A handful of these stay inside the prerender cache-fill limit. */
export const UPSTREAM_ATTEMPT_MS = 8_000;

/**
 * Several reads that share one `use cache` function (OpenF1 results, for example). Short of the
 * prerender limit so the slowest of them returns a fallback instead of failing the page.
 */
export const UPSTREAM_BUDGET_MS = 20_000;
