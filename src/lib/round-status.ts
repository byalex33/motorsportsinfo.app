// Pure helpers: which Session is live or next, and countdown maths.
import { RADAR_LEAD_MINUTES } from "@/domain/series";
import type { Session } from "@/domain/types";

export type RoundStatus =
  | { kind: "live"; session: Session }
  | { kind: "upcoming"; session: Session }
  | { kind: "finished" };

export type SessionPhase = "cancelled" | "finished" | "live" | "upcoming";

/** Phase of one Session at `now`. Cancelled Sessions stay cancelled whatever the time. */
export function sessionPhase(session: Session, now: number): SessionPhase {
  if (session.status === "cancelled") return "cancelled";
  const start = Date.parse(session.startsAt);
  const end = Date.parse(session.endsAt);
  if (now >= end) return "finished";
  if (now >= start) return "live";
  return "upcoming";
}

/**
 * The Session the hero counts towards. A running Session wins (earliest-starting if several overlap);
 * otherwise the next Session to start. Cancelled Sessions are ignored.
 */
export function getRoundStatus(sessions: Session[], now: number): RoundStatus {
  const active = sessions
    .filter((s) => s.status !== "cancelled")
    .slice()
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const live = active.find((s) => sessionPhase(s, now) === "live");
  if (live) return { kind: "live", session: live };
  const next = active.find((s) => Date.parse(s.startsAt) > now);
  if (next) return { kind: "upcoming", session: next };
  return { kind: "finished" };
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Milliseconds remaining, never negative. */
  totalMs: number;
}

export function countdownParts(targetIso: string, now: number): CountdownParts {
  const totalMs = Math.max(0, Date.parse(targetIso) - now);
  const totalSeconds = Math.floor(totalMs / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalMs,
  };
}

/** Compact spoken form for screen readers and small spaces: "2d 4h 05m", "4h 05m", "12m 09s". */
export function formatCountdown(parts: CountdownParts): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (parts.days > 0) return `${parts.days}d ${parts.hours}h ${pad(parts.minutes)}m`;
  if (parts.hours > 0) return `${parts.hours}h ${pad(parts.minutes)}m`;
  return `${parts.minutes}m ${pad(parts.seconds)}s`;
}

/** True while the rain radar would be shown (RADAR_LEAD_MINUTES before a Session until it ends). */
export function isRadarWindow(sessions: Session[], now: number): boolean {
  const lead = RADAR_LEAD_MINUTES * 60_000;
  return sessions.some(
    (s) => s.status !== "cancelled" && now >= Date.parse(s.startsAt) - lead && now < Date.parse(s.endsAt),
  );
}
