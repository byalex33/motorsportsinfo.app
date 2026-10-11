import type { CSSProperties } from "react";

/**
 * Entrance timeline shared by the Round, Alerts and About pages (ms after first paint).
 * Entrances start at least half visible (globals.css), so nothing here delays reading: it only
 * orders the settle. Everything that carries data has started moving by ~200 ms.
 */
export const ENTER = {
  eyebrow: 0,
  title: 30,
  /** Words of a headline spread over at most this window. */
  titleWindow: 150,
  meta: 90,
  metaStep: 30,
  lead: 120,
  countdown: 130,
  body: 160,
  rows: 180,
  rowStep: 18,
  /** Rows after this index share its delay, so long lists never lag. */
  rowCap: 5,
} as const;

/**
 * Inline delay for the `enter-*` utilities in globals.css. A plain animation-delay (not a custom
 * property) so it never leaks into nested entrances; reduced motion overrides it to 0.
 */
export function enterDelay(ms: number): CSSProperties {
  return { animationDelay: `${Math.round(ms)}ms` };
}

/** Delay for item `index` of a staggered list. */
export function staggerDelay(index: number, base: number = ENTER.rows, step: number = ENTER.rowStep, cap: number = ENTER.rowCap) {
  return enterDelay(base + Math.min(index, cap) * step);
}
