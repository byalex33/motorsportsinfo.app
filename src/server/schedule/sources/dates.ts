import { matchCircuit } from "@/data/circuits";
import { trackDate } from "../time";

/** Track Time date of a UTC instant at the Circuit named by `hints`, or null if the Circuit is unknown. */
export function getCircuitTimeZoneDate(hints: string[], instant: string | null | undefined): string | null {
  if (!instant) return null;
  const circuit = matchCircuit(hints);
  const d = new Date(instant);
  if (!circuit || Number.isNaN(d.getTime())) return null;
  return trackDate(d, circuit.timeZone);
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export function monthNumber(name: string): number | null {
  const n = name.trim().toLowerCase().slice(0, 3);
  const i = MONTHS.findIndex((m) => m.startsWith(n));
  return n.length === 3 && i >= 0 ? i + 1 : null;
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
