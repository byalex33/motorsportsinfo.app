// HTTP helpers for the schedule sources: descriptive User-Agent, timeouts and polite delays.
import { withDeadline } from "@/server/deadline";

/** A source request gives up after this, including when the socket ignores the abort signal. */
export const UPSTREAM_TIMEOUT_MS = 20_000;

/** Sent to APIs (OpenF1, Jolpica, GitHub raw). */
export const API_USER_AGENT = "motorsportsinfo.app (+https://motorsportsinfo.app/about)";
/** Sent to sites that only serve full pages to browsers (fiaformula2.com, fiaformula3.com, fiawec.com). */
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 motorsportsinfo.app/1.0 (+https://motorsportsinfo.app/about)";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface SourceContext {
  fetch: Fetcher;
  /** Waits between requests to the same host. Tests pass a no-op. */
  sleep: (ms: number) => Promise<void>;
}

export const defaultContext: SourceContext = {
  fetch: (url, init) => fetch(url, { cache: "no-store", ...init }),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

async function request(ctx: SourceContext, url: string, userAgent: string, accept: string): Promise<Response> {
  const res = await ctx.fetch(url, {
    headers: { "User-Agent": userAgent, Accept: accept, "Accept-Language": "en" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new HttpError(url, res.status);
  }
  return res;
}

/**
 * Headers and body share one deadline. `fetch` resolving only means the headers arrived; a body that
 * never finishes would otherwise hold a `use cache` fill until the prerender gives up. The deadline
 * also fires when Next's patched fetch drops AbortSignal during a stale revalidation.
 */
function bounded<T>(work: Promise<T>): Promise<T> {
  return withDeadline(work, UPSTREAM_TIMEOUT_MS, "upstream");
}

export async function getJson<T>(ctx: SourceContext, url: string): Promise<T> {
  return bounded((async () => {
    const res = await request(ctx, url, API_USER_AGENT, "application/json");
    return (await res.json()) as T;
  })());
}

export async function getPage(ctx: SourceContext, url: string, userAgent = BROWSER_USER_AGENT): Promise<string> {
  return bounded((async () => {
    const res = await request(ctx, url, userAgent, "text/html,application/xhtml+xml");
    return res.text();
  })());
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
