/**
 * A classified position from OpenF1, or null. OpenF1 usually gives a number, but sometimes a status in its
 * place, e.g. "RT" for a driver who retired before setting a time; those count as not classified.
 */
export function classifiedPosition(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
