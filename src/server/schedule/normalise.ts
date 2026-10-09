// Turns each source's RawRounds into domain Rounds and Sessions with stable ids.
import { getCircuit, matchCircuit } from "@/data/circuits";
import { defaultSessionMinutes } from "@/domain/series";
import type { Round, SeriesId, Session } from "@/domain/types";
import { addMinutes, toIso, trackDate } from "./time";
import type { RawRound, RoundWithSessions } from "./types";

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function roundId(series: SeriesId, season: number, slug: string): string {
  return `${series}-${season}-${slug}`;
}

export function sessionId(roundIdValue: string, slug: string): string {
  return `${roundIdValue}:${slug}`;
}

function firstStart(raw: RawRound): string {
  const starts = raw.sessions.map((s) => s.startsAt).sort();
  return starts[0] ?? raw.startDate ?? "9999";
}

/**
 * Normalises RawRounds from one source.
 * - The Round slug is the Circuit id, so ids agree between a primary source and its fallback.
 *   A second Round at the same Circuit in one season gets "-2".
 * - Session slugs come from the source's Session name ("Practice 1" → "practice-1").
 * - Missing end times use the Series' default Session length and set endIsEstimated.
 * - A Round with no Session times keeps its dates and has sessionTimesConfirmed=false.
 * - An unknown Circuit or unmappable Session is reported as a problem and skipped, never guessed.
 */
export function normaliseRounds(
  series: SeriesId,
  raws: RawRound[],
): { rounds: RoundWithSessions[]; problems: string[] } {
  const problems: string[] = [];
  const rounds: RoundWithSessions[] = [];
  const usedSlugs = new Set<string>();

  const ordered = [...raws].sort((a, b) => a.season - b.season || firstStart(a).localeCompare(firstStart(b)));

  for (const raw of ordered) {
    const circuit =
      raw.circuitId !== undefined ? (raw.circuitId ? (getCircuit(raw.circuitId) ?? null) : null) : matchCircuit(raw.circuitHints);
    if (!circuit) {
      problems.push(
        `Unknown Circuit for ${series.toUpperCase()} ${raw.season} "${raw.name}" (${raw.circuitHints.join(" / ")}) from ${raw.sourceRef}; Round skipped`,
      );
      continue;
    }

    let slug = circuit.id;
    for (let n = 2; usedSlugs.has(`${raw.season}/${slug}`); n++) slug = `${circuit.id}-${n}`;
    usedSlugs.add(`${raw.season}/${slug}`);
    const id = roundId(series, raw.season, slug);

    const sessions: Session[] = [];
    if (raw.timesConfirmed) {
      const usedSessionSlugs = new Set<string>();
      for (const s of raw.sessions) {
        if (!s.type) {
          problems.push(`Unmapped Session "${s.name}" in ${id} from ${raw.sourceRef}; Session skipped`);
          continue;
        }
        const startsAt = toIso(s.startsAt);
        if (!startsAt) {
          problems.push(`Unreadable start time "${s.startsAt}" for "${s.name}" in ${id}; Session skipped`);
          continue;
        }
        const base = slugify(s.key) || s.type;
        let sessionSlug = base;
        for (let n = 2; usedSessionSlugs.has(sessionSlug); n++) sessionSlug = `${base}-${n}`;
        usedSessionSlugs.add(sessionSlug);

        const sourceEnd = toIso(s.endsAt);
        const endIsEstimated = !sourceEnd || sourceEnd <= startsAt;
        // For WEC Races the length is in the Round name ("6 Hours of Barcelona") rather than "Race".
        const lengthName = /\d+\s*hours?/i.test(s.name) ? s.name : `${s.name} ${raw.name}`;
        const endsAt = endIsEstimated
          ? addMinutes(startsAt, defaultSessionMinutes(series, s.type, lengthName))
          : sourceEnd!;

        sessions.push({
          id: sessionId(id, sessionSlug),
          roundId: id,
          series,
          type: s.type,
          name: s.name,
          startsAt,
          endsAt,
          endIsEstimated,
          status: s.cancelled ? "cancelled" : "scheduled",
        });
      }
      sessions.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }

    // Dates span both the source's own Round dates (Track Time) and the Session times.
    const candidatesStart = [raw.startDate, ...sessions.map((s) => trackDate(s.startsAt, circuit.timeZone))];
    const candidatesEnd = [raw.endDate, ...sessions.map((s) => trackDate(s.endsAt, circuit.timeZone))];
    const startDate = candidatesStart.filter((d): d is string => !!d).sort()[0] ?? null;
    const endDate = candidatesEnd.filter((d): d is string => !!d).sort().at(-1) ?? null;
    if (!startDate || !endDate) {
      problems.push(`No dates or Session times for ${id} "${raw.name}" from ${raw.sourceRef}; Round skipped`);
      continue;
    }

    const round: Round = {
      id,
      series,
      season: raw.season,
      slug,
      name: raw.name,
      circuitId: circuit.id,
      startDate,
      endDate,
      sessionTimesConfirmed: raw.timesConfirmed && sessions.length > 0,
    };
    rounds.push({ round, sessions });
  }

  return { rounds, problems };
}
