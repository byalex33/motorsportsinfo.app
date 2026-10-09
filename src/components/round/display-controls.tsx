"use client";

import { GlobeIcon } from "lucide-react";
import { InlineSkeleton } from "@/components/inline-skeleton";
import { SegmentPill } from "@/components/motion/segment-pill";
import { track } from "@/lib/analytics";
import type { DisplayZone } from "@/lib/display-zone";
import { useTimePref, useUnitsPref, type TimeMode, type UnitsPref } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { TimeZonePicker } from "./time-zone-picker";

const segment =
  "relative flex h-7 items-center rounded-full px-3 text-[0.8125rem] font-medium whitespace-nowrap transition-colors duration-300 ease-expo outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Segmented-control track; the SegmentPill inside slides to the active item. */
const segmentTrack =
  "group/seg relative flex items-center rounded-full bg-muted p-0.5";

function SegmentButton({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={cn(
        segment,
        active ? "bg-foreground text-background group-data-[pill=ready]/seg:bg-transparent!" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Time zone pill (Viewer Time / Track Time / chosen zone) and unit toggles. */
export function DisplayControls({ zone }: { zone: DisplayZone | null }) {
  const time = useTimePref();
  const units = useUnitsPref();

  function setMode(mode: TimeMode, tz?: string) {
    if (mode === time.value.mode && tz === time.value.tz) return;
    time.set(mode === "custom" ? { mode, tz } : { mode });
    track("timezone_mode_changed", { mode });
  }

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
        {zone ? (
          <span className="min-w-0 truncate">
            <span className="font-medium">{zone.heading}</span>
            <span className="font-mono text-xs text-muted-foreground"> · {zone.tz}</span>
          </span>
        ) : (
          <InlineSkeleton className="h-4 w-52" />
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Show times in" className={cn(segmentTrack, "min-w-0")}>
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
