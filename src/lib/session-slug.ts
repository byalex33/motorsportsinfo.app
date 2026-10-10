import type { Session } from "@/domain/types";

/** The Session's part of its id, used in URLs: "f1-2026-marina-bay:sprint-qualifying" → "sprint-qualifying". */
export function sessionSlug(session: Pick<Session, "id" | "roundId">): string {
  return session.id.startsWith(`${session.roundId}:`) ? session.id.slice(session.roundId.length + 1) : session.id;
}
