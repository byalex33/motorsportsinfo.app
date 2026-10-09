// Small external stores read with useSyncExternalStore. Server snapshots are stable placeholders,
// so server HTML and the hydration render always match; client values arrive in the next render.
import { useSyncExternalStore } from "react";

// --- Clock ------------------------------------------------------------------

let clockNow = 0;
let clockTimer: ReturnType<typeof setInterval> | undefined;
const clockListeners = new Set<() => void>();

function readClock(): number {
  if (clockNow === 0 || clockTimer === undefined) clockNow = Date.now();
  return clockNow;
}

function subscribeClock(cb: () => void) {
  clockListeners.add(cb);
  if (clockTimer === undefined) {
    clockNow = Date.now();
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      for (const l of clockListeners) l();
    }, 1000);
  }
  return () => {
    clockListeners.delete(cb);
    if (clockListeners.size === 0 && clockTimer !== undefined) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

/**
 * Current time in ms, rounded down to `stepMs` so subscribers re-render only when the step changes.
 * Null on the server and during hydration.
 */
export function useNow(stepMs = 1000): number | null {
  return useSyncExternalStore<number | null>(
    subscribeClock,
    () => Math.floor(readClock() / stepMs) * stepMs,
    () => null,
  );
}

// --- Hydrated flag ------------------------------------------------------------

const noopSubscribe = () => () => {};

/** False on the server and during hydration, true afterwards (and on client navigations). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

// --- Online status ------------------------------------------------------------

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** True unless the browser reports it is offline. Always true on the server. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
    () => true,
  );
}

// --- Page data stamp ----------------------------------------------------------
// A page that shows server data registers when that data was rendered, so the
// offline banner in the layout can say "last updated {time}".

let stamp: string | null = null;
const stampListeners = new Set<() => void>();

export function setPageStamp(value: string | null) {
  if (stamp === value) return;
  stamp = value;
  for (const l of stampListeners) l();
}

function subscribeStamp(cb: () => void) {
  stampListeners.add(cb);
  return () => {
    stampListeners.delete(cb);
  };
}

export function usePageStamp(): string | null {
  return useSyncExternalStore(
    subscribeStamp,
    () => stamp,
    () => null,
  );
}
