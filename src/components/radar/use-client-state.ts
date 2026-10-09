"use client";
import { useSyncExternalStore } from "react";

const MINUTE_MS = 60_000;

function subscribeClock(onChange: () => void) {
  const id = window.setInterval(onChange, 10_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onChange);
  };
}

const currentMinute = () => Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;

/**
 * The client clock, floored to the minute; re-renders when the minute changes.
 * Null during server rendering and hydration, so nothing time-dependent is prerendered.
 */
export function useMinuteClock(): number | null {
  return useSyncExternalStore<number | null>(subscribeClock, currentMinute, () => null);
}

function subscribeDarkClass(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** Tracks the `.dark` class next-themes sets on <html>. */
export function useIsDarkMode(): boolean {
  return useSyncExternalStore(
    subscribeDarkClass,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}
