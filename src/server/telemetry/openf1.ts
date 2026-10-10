// F1 Telemetry from OpenF1 (https://openf1.org): laps, car data (~4 Hz) and position (~4 Hz). CC BY-NC-SA 4.0.
import type { SessionTelemetry, TelemetryDriver, TelemetryLap } from "@/domain/types";
import { classifiedPosition } from "@/server/openf1/position";

export interface OpenF1Lap {
  driver_number: number;
  lap_number: number;
  date_start: string | null;
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  i1_speed: number | null;
  i2_speed: number | null;
  st_speed: number | null;
  is_pit_out_lap: boolean;
}

export interface OpenF1CarData {
  date: string;
  /** km/h. */
  speed: number;
  /** %, occasionally a little over 100. */
  throttle: number;
  /** 0 or 100. */
  brake: number;
  n_gear: number;
}

export interface OpenF1Location {
  date: string;
  x: number;
  y: number;
}

export interface OpenF1TelemetryDriver {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  team_name: string | null;
  /** Hex without the #, e.g. "4781D7". */
  team_colour: string | null;
}

export interface OpenF1Classified {
  driver_number: number;
  /** Sometimes a status such as "RT" instead of a number. */
  position: number | string | null;
}

export function parseSessionTelemetry(
  laps: OpenF1Lap[],
  drivers: OpenF1TelemetryDriver[],
  classification: OpenF1Classified[],
): SessionTelemetry {
  const position = new Map(classification.map((c) => [c.driver_number, classifiedPosition(c.position)]));
  const byDriver: Record<number, TelemetryLap[]> = {};
  for (const lap of laps) {
    (byDriver[lap.driver_number] ??= []).push({
      lap: lap.lap_number,
      startsAt: lap.date_start ? new Date(lap.date_start).toISOString() : null,
      time: lap.lap_duration,
      sectors: [lap.duration_sector_1, lap.duration_sector_2, lap.duration_sector_3],
      trapSpeed: lap.st_speed,
      i1Speed: lap.i1_speed,
      i2Speed: lap.i2_speed,
      pitOut: lap.is_pit_out_lap,
    });
  }
  for (const list of Object.values(byDriver)) list.sort((a, b) => a.lap - b.lap);

  const seen = new Set<number>();
  const out: TelemetryDriver[] = [];
  for (const d of drivers) {
    if (seen.has(d.driver_number)) continue;
    seen.add(d.driver_number);
    const parts = [d.first_name, d.last_name].filter(Boolean);
    out.push({
      number: d.driver_number,
      code: d.name_acronym,
      name: parts.length > 0 ? parts.join(" ") : d.full_name,
      team: d.team_name,
      color: d.team_colour && /^[0-9a-f]{6}$/i.test(d.team_colour) ? `#${d.team_colour}` : null,
      position: position.get(d.driver_number) ?? null,
    });
  }
  out.sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.number - b.number);
  return { drivers: out, laps: byDriver };
}

/** A driver's quickest timed lap that did not start in the pit lane, or null when they set none. */
export function fastestLap(laps: TelemetryLap[]): TelemetryLap | null {
  let best: TelemetryLap | null = null;
  for (const lap of laps) {
    if (lap.time === null || lap.pitOut || lap.startsAt === null) continue;
    if (!best || lap.time < best.time!) best = lap;
  }
  return best;
}
