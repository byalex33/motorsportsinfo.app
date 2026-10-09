"use client";

import { useMemo } from "react";
import { resolveDisplayZone, type DisplayZone } from "@/lib/display-zone";
import { useTimePref } from "@/lib/prefs";
import { deviceTimeZone } from "@/lib/time-format";

/** The zone Session times are shown in, or null on the server and during hydration. */
export function useDisplayZone(circuitTimeZone: string): DisplayZone | null {
  const { value, ready } = useTimePref();
  return useMemo(
    () => (ready ? resolveDisplayZone(value, circuitTimeZone, deviceTimeZone()) : null),
    [ready, value, circuitTimeZone],
  );
}
