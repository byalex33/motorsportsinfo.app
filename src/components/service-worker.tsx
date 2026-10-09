"use client";

import { useEffect } from "react";
import { setPageStamp } from "@/lib/client-stores";

/** Registers /sw.js in production builds only. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        if (cancelled) return;
        // Assets fetched before the worker took control are not in its cache yet: hand them over
        // so the page works offline from the next visit.
        const urls = [
          location.pathname,
          ...performance
            .getEntriesByType("resource")
            .map((e) => e.name)
            .filter((u) => u.startsWith(location.origin) && /\/_next\/static\/|\/icons\//.test(u)),
        ];
        reg.active?.postMessage({ type: "CACHE_URLS", urls });
      })
      .catch(() => {
        // Offline support is a nicety; ignore registration failures.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}

/** Records when this page's server data was rendered, for the offline banner. */
export function PageStamp({ at }: { at: string }) {
  useEffect(() => {
    setPageStamp(at);
    return () => setPageStamp(null);
  }, [at]);
  return null;
}
