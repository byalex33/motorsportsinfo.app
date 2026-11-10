// HTTP helpers for the schedule sources: descriptive User-Agent, timeouts, polite delays, and limits that keep
// a request on its own site and its body to a bounded size.
import { withDeadline } from "@/server/deadline";

/** A source request gives up after this, including when the socket ignores the abort signal. */
export const UPSTREAM_TIMEOUT_MS = 20_000;

/** Sent to APIs (OpenF1, Jolpica, GitHub raw). */
export const API_USER_AGENT = "motorsportsinfo.app (+https://motorsportsinfo.app/about)";
/** Sent to sites that only serve full pages to browsers (fiawec.com). */
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 motorsportsinfo.app/1.0 (+https://motorsportsinfo.app/about)";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface SourceContext {
  fetch: Fetcher;
  /** Waits between requests to the same host. Tests pass a no-op. */
  sleep: (ms: number) => Promise<void>;
  /** The sync run's deadline: aborting it cancels every request still in flight. */
  signal?: AbortSignal;
}

export const defaultContext: SourceContext = {
  fetch: (url, init) => fetch(url, { cache: "no-store", ...init }),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** A source response body larger than this is refused: the biggest real one is well under 1 MB. */
export const MAX_BODY_BYTES = 5 * 1024 * 1024;

/**
 * Only the origin of a URL, for messages: errors are logged, stored in source_checks.last_error and shown
 * by /api/status, and some source URLs carry a secret in their path or query (IMSA_CALENDAR_URL).
 */
export function urlOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "(unreadable URL)";
  }
}

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`HTTP ${status} for ${urlOrigin(url)}`);
  }
}

/** A source has nothing for the season asked for (a calendar without it). See loadSeasons in index.ts. */
export class NoRoundsError extends Error {}

/** "www.fiawec.com" and "fiawec.com" are one host for the redirect check. */
function siteHost(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

async function request(ctx: SourceContext, url: string, userAgent: string, accept: string): Promise<Response> {
  const res = await ctx.fetch(url, {
    headers: { "User-Agent": userAgent, Accept: accept, "Accept-Language": "en" },
    signal: ctx.signal ? AbortSignal.any([AbortSignal.timeout(UPSTREAM_TIMEOUT_MS), ctx.signal]) : AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  // A redirect may not take a source request off its own site (fetch reports the final URL in `res.url`).
  if (res.url && siteHost(res.url) !== siteHost(url)) {
    await res.body?.cancel();
    throw new Error(`${urlOrigin(url)} redirected to another host (${urlOrigin(res.url)})`);
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new HttpError(url, res.status);
  }
  return res;
}

/** The body as text, refusing one over MAX_BODY_BYTES (declared or streamed) before it fills memory. */
async function readText(res: Response, url: string): Promise<string> {
  const tooLarge = () => new Error(`${urlOrigin(url)} body is larger than ${MAX_BODY_BYTES} bytes`);
  if (Number(res.headers.get("content-length")) > MAX_BODY_BYTES) {
    await res.body?.cancel();
    throw tooLarge();
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
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
    return JSON.parse(await readText(res, url)) as T;
  })());
}

export async function getPage(ctx: SourceContext, url: string, userAgent = BROWSER_USER_AGENT): Promise<string> {
  return bounded((async () => {
    const res = await request(ctx, url, userAgent, "text/html,application/xhtml+xml");
    return readText(res, url);
  })());
}

/**
 * Settles like `promise`, or rejects with the signal's reason as soon as it aborts, even when the work
 * behind the promise ignores the signal (a page parse, a source that never answers).
 */
export function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
