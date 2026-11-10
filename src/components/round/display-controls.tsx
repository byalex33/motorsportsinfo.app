"use client";

import { GlobeIcon } from "lucide-react";
import { SegmentButton, SegmentPill, segmentTrack } from "@/components/motion/segment-pill";
import { track } from "@/lib/analytics";
import type { DisplayZone } from "@/lib/display-zone";
import { useTimePref, useUnitsPref, type TimeMode, type UnitsPref } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { TimeZonePicker } from "./time-zone-picker";

/** The Viewer Time / Track Time / chosen-zone segmented control, shared by Round pages and the calendar. */
export function TimeModeControl({ mode, className }: { mode: TimeMode | null | undefined; className?: string }) {
  const time = useTimePref();

  function setMode(next: TimeMode, tz?: string) {
    if (next === time.value.mode && tz === time.value.tz) return;
    time.set(next === "custom" ? { mode: next, tz } : { mode: next });
    track("timezone_mode_changed", { mode: next });
  }

  return (
    <div role="group" aria-label="Show times in" className={cn(segmentTrack, className)}>
      <SegmentPill />
      <SegmentButton active={mode === "viewer"} onClick={() => setMode("viewer")}>
        Your time
      </SegmentButton>
      <SegmentButton active={mode === "track"} onClick={() => setMode("track")}>
        Track time
      </SegmentButton>
      <TimeZonePicker
        active={mode === "custom"}
        value={time.value.mode === "custom" ? (time.value.tz ?? null) : null}
        onSelect={(tz) => setMode("custom", tz)}
        className="max-w-36"
      />
    </div>
  );
}

/** Time zone pill (Viewer Time / Track Time / chosen zone) and unit toggles. */
export function DisplayControls({ zone, circuitTimeZone }: { zone: DisplayZone | null; circuitTimeZone: string }) {
  const units = useUnitsPref();

  function setUnits(next: UnitsPref) {
    if (next.temp === units.value.temp && next.wind === units.value.wind) return;
    units.set(next);
    track("units_changed", { temp: next.temp, wind: next.wind });
  }

  const mode = zone?.mode;

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <p className="flex min-w-0 items-center gap-2 text-sm" aria-live="polite">
        <GlobeIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {/* Until the viewer's zone is known (server HTML, hydration) the Sessions show Track Time, and so does this label. */}
        <span className="min-w-0 truncate">
          <span className="font-medium">{zone ? zone.heading : "Track time"}</span>
          <span className="font-mono text-xs text-muted-foreground"> · {zone ? zone.tz : circuitTimeZone}</span>
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <TimeModeControl mode={mode} className="min-w-0" />

        <div className="flex items-center gap-2">
          <div role="group" aria-label="Temperature unit" className={segmentTrack}>
            <SegmentPill />
            <SegmentButton label="Celsius" active={units.ready && units.value.temp === "c"} onClick={() => setUnits({ ...units.value, temp: "c" })}>
              °C
            </SegmentButton>
            <SegmentButton label="Fahrenheit" active={units.ready && units.value.temp === "f"} onClick={() => setUnits({ ...units.value, temp: "f" })}>
              °F
            </SegmentButton>
          </div>
          <div role="group" aria-label="Wind speed unit" className={segmentTrack}>
            <SegmentPill />
            <SegmentButton label="Kilometres per hour" active={units.ready && units.value.wind === "kmh"} onClick={() => setUnits({ ...units.value, wind: "kmh" })}>
              km/h
            </SegmentButton>
            <SegmentButton label="Miles per hour" active={units.ready && units.value.wind === "mph"} onClick={() => setUnits({ ...units.value, wind: "mph" })}>
              mph
            </SegmentButton>
          </div>
        </div>
      </div>
    </div>
  );
}
