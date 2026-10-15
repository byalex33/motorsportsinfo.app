export type TempUnit = "c" | "f";
export type WindUnit = "kmh" | "mph";

const KM_PER_MILE = 1.609344;

export function formatTemperature(celsius: number, unit: TempUnit): string {
  const value = unit === "f" ? celsius * 1.8 + 32 : celsius;
  // Math.round(-0.4) is -0; normalise so we never print "-0°".
  return `${Math.round(value) || 0}°${unit === "f" ? "F" : "C"}`;
}

export function formatWindSpeed(kmh: number, unit: WindUnit): string {
  return unit === "mph" ? `${Math.round(kmh / KM_PER_MILE)} mph` : `${Math.round(kmh)} km/h`;
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

function compassIndex(degrees: number): number {
  return Math.round((((degrees % 360) + 360) % 360) / 45) % 8;
}

/** Meteorological wind direction (where the wind comes from) as words, e.g. "south-west". */
export function compassName(degrees: number): string {
  return COMPASS[compassIndex(degrees)];
}

/** "12 Oct" in the given time zone; falls back to UTC if the zone is invalid. */
export function formatForecastDate(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  try {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(date);
  }
}
