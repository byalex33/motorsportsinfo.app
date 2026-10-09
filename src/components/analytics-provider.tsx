"use client";
// CONTRACT — owned by the analytics work. Mounted once in the root layout.
import { useEffect } from "react";
import { initAnalytics } from "@/lib/analytics";

// Creates the single Tracwell client after hydration (document is available).
// initAnalytics() is idempotent, so re-running effects (Strict Mode, remounts)
// never creates a second client. Route changes are observed by the SDK via the
// History API, so this component deliberately does not watch the pathname.
export function AnalyticsProvider() {
  useEffect(() => {
    initAnalytics();
  }, []);
  return null;
}
