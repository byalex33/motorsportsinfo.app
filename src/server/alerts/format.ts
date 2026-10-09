// Time formatting for push text, in the subscriber's saved time zone.

const timeFormatters = new Map<string, Intl.DateTimeFormat>();
const dayFormatters = new Map<string, Intl.DateTimeFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function formatter(cache: Map<string, Intl.DateTimeFormat>, timeZone: string, options: Intl.DateTimeFormatOptions) {
  let f = cache.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-GB", { ...options, timeZone });
    } catch {
      f = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" });
    }
    cache.set(timeZone, f);
  }
  return f;
}

/** "22:00" */
export function formatClock(at: Date, timeZone: string): string {
  return formatter(timeFormatters, timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

/** "Sat" */
export function formatWeekday(at: Date, timeZone: string): string {
  return formatter(dayFormatters, timeZone, { weekday: "short" }).format(at);
}

/** Calendar date in the zone, e.g. "21/11/2026" — only compared, never shown. */
export function dayKey(at: Date, timeZone: string): string {
  return formatter(dateFormatters, timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** "Sat 14:00" */
export function formatDayClock(at: Date, timeZone: string): string {
  return `${formatWeekday(at, timeZone)} ${formatClock(at, timeZone)}`;
}

/** "22:00" when on the same day as `now` in the zone, else "Sat 22:00". */
export function formatStart(at: Date, now: Date, timeZone: string): string {
  return dayKey(at, timeZone) === dayKey(now, timeZone) ? formatClock(at, timeZone) : formatDayClock(at, timeZone);
}

/** "15 min", "1 hour", "24 hours" — how long until a Session starts. */
export function formatTimeUntil(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 90) return m === 60 ? "1 hour" : `${m} min`;
  const h = Math.round(m / 60);
  return `${h} hours`;
}
