import type { TimePref } from "@/lib/prefs";
import { isValidTimeZone } from "@/lib/time-format";

export interface DisplayZone {
  /** IANA zone Session times are shown in. */
  tz: string;
  mode: TimePref["mode"];
  /** Short heading, e.g. "Times in your time". */
  heading: string;
  /** Full label, e.g. "Times in your time · Europe/London". */
  label: string;
}

/**
 * Which zone to show times in. Viewer Time uses the device zone; Track Time the Circuit's zone;
 * a custom zone falls back to the device zone if it is not valid here.
 */
export function resolveDisplayZone(pref: TimePref, circuitTimeZone: string, deviceTimeZone: string): DisplayZone {
  if (pref.mode === "track" && isValidTimeZone(circuitTimeZone)) {
    return { tz: circuitTimeZone, mode: "track", heading: "Track time", label: `Track time · ${circuitTimeZone}` };
  }
  if (pref.mode === "custom" && isValidTimeZone(pref.tz)) {
    return { tz: pref.tz, mode: "custom", heading: "Times in your chosen zone", label: `Times in your chosen zone · ${pref.tz}` };
  }
  return { tz: deviceTimeZone, mode: "viewer", heading: "Times in your time", label: `Times in your time · ${deviceTimeZone}` };
}
