// CONTRACT — owned by the analytics work. Call track() after an action completes.
//
// Tracwell browser analytics. One client per page lifetime, created by
// <AnalyticsProvider /> (mounted once in the root layout) after hydration.
// Page views — initial load and App Router History API navigations — are
// captured by the SDK itself; never add router-driven page() calls here.
// The site has no accounts, so identify() is intentionally never called.
import { createTracwell, type EventProperties, type TracwellClient } from "tracwell";
import type { FiaDocumentKind, SeriesId, SessionType } from "@/domain/types";

export type AnalyticsEvent =
  | { name: "series_selected"; props: { series: SeriesId } }
  | { name: "timezone_mode_changed"; props: { mode: "viewer" | "track" | "custom" } }
  | { name: "units_changed"; props: { temp: "c" | "f"; wind: "kmh" | "mph" } }
  | { name: "push_enabled"; props: { series_count: number } }
  | { name: "push_disabled"; props: { series_count: number } }
  | { name: "calendar_feed_created"; props: { series: SeriesId[]; session_types: SessionType[] } }
  | { name: "radar_opened"; props: { series: SeriesId } }
  | { name: "fia_document_opened"; props: { series: SeriesId; kind: FiaDocumentKind } };

// Public, browser-safe project key (not a server key).
const TRACWELL_PROJECT_KEY = "tw_live_c30cab1cc96e4c349fe89d7a22be92ab";

// Events tracked in the browser before the provider's effect runs are held
// briefly and flushed into the client once it exists.
const MAX_PENDING = 20;

type State =
  | { status: "uninitialised"; pending: Array<[string, EventProperties]> }
  | { status: "ready"; client: TracwellClient }
  | { status: "disabled" };

let state: State = { status: "uninitialised", pending: [] };

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

/**
 * Creates the single Tracwell client. Browser-only and idempotent: safe to call
 * from an effect that may run more than once. Analytics stays disabled outside
 * production builds and on local hosts.
 */
export function initAnalytics(): void {
  if (!isBrowser() || state.status !== "uninitialised") return;
  const { pending } = state;

  try {
    if (process.env.NODE_ENV !== "production" || isLocalHost(window.location.hostname)) {
      state = { status: "disabled" };
      return;
    }

    // Private mode never reads or writes cookies or storage: no identifier stays on the device, so no
    // consent banner is needed. The About page's Privacy section describes this; keep the two in step.
    const client = createTracwell({
      projectKey: TRACWELL_PROJECT_KEY,
      collectionMode: "private",
      respectDoNotTrack: true,
    });
    state = { status: "ready", client };
    for (const [name, props] of pending) client.track(name, props);
  } catch {
    // Analytics must never break the site.
    state = { status: "disabled" };
  }
}

export function track<E extends AnalyticsEvent>(name: E["name"], props: E["props"]): void {
  try {
    if (!isBrowser()) return; // SSR: no-op, and never buffer in shared server memory.
    switch (state.status) {
      case "ready":
        state.client.track(name, props as EventProperties);
        return;
      case "uninitialised":
        if (state.pending.length < MAX_PENDING) state.pending.push([name, props as EventProperties]);
        return;
      case "disabled":
        return;
    }
  } catch {
    // Swallow: tracking is best-effort and must never throw into UI code.
  }
}
