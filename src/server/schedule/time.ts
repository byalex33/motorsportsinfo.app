// Time zone helpers. Track Time dates are always computed in the Circuit's IANA time zone.

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = dateFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dateFormatters.set(timeZone, f);
  }
  return f;
}

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(timeZone, f);
  }
  return f;
}

/** The Track Time calendar date (YYYY-MM-DD) of an instant. */
export function trackDate(instant: Date | string, timeZone: string): string {
  return dateFormatter(timeZone).format(new Date(instant));
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (e.g. +240 for Baku). */
export function zoneOffsetMinutes(timeZone: string, instant: Date): number {
  const parts = Object.fromEntries(partsFormatter(timeZone).formatToParts(instant).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** The UTC instant of 00:00 Track Time on `date` (YYYY-MM-DD). */
export function trackMidnight(date: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let result = guess - zoneOffsetMinutes(timeZone, new Date(guess)) * 60000;
  // Re-check once in case a DST transition lies between the guess and the result.
  result = guess - zoneOffsetMinutes(timeZone, new Date(result)) * 60000;
  return new Date(result);
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "+04:00", "-08:00:00", "08:00:00" → minutes east of UTC. */
export function parseGmtOffset(offset: string): number | null {
  const m = /^([+-])?(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(offset.trim());
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

/** A local wall-clock time without offset ("2026-09-24T10:00:00") plus a GMT offset → ISO UTC. */
export function localWithOffsetToIso(local: string, gmtOffset: string): string | null {
  const offset = parseGmtOffset(gmtOffset);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(local);
  if (offset === null || !m) return null;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  return new Date(utc - offset * 60000).toISOString();
}

/** Normalises any parseable timestamp to ISO 8601 UTC with milliseconds, or null. */
export function toIso(value: string | number | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
