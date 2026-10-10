// Which Sessions' results this tab has chosen to see. Kept in sessionStorage so revealing a Session's results
// in its Results modal also opens its Telemetry page, and both stay revealed until the tab is closed.
import { useCallback, useSyncExternalStore } from "react";

const KEY = "spoilers-revealed";
const listeners = new Set<() => void>();
let revealed: Set<string> | null = null;

function load(): Set<string> {
  if (revealed) return revealed;
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    revealed = new Set(Array.isArray(stored) ? stored.filter((v): v is string => typeof v === "string") : []);
  } catch {
    revealed = new Set();
  }
  return revealed;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Whether the viewer chose to see this Session's results, and a function to choose it. Null on the server
 * and during hydration, so neither the warning nor the results flash before the stored choice is known.
 */
export function useSpoilerRevealed(sessionId: string): [revealed: boolean | null, reveal: () => void] {
  const value = useSyncExternalStore<boolean | null>(
    subscribe,
    () => load().has(sessionId),
    () => null,
  );
  const reveal = useCallback(() => {
    const next = load();
    next.add(sessionId);
    try {
      sessionStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
      // Private mode or storage full: still revealed for this page view.
    }
    for (const l of listeners) l();
  }, [sessionId]);
  return [value, reveal];
}
