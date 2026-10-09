"use client";

import { GlobeIcon } from "lucide-react";
import { InlineSkeleton } from "@/components/inline-skeleton";
import { track } from "@/lib/analytics";
import type { DisplayZone } from "@/lib/display-zone";
import { useTimePref, useUnitsPref, type TimeMode, type UnitsPref } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { TimeZonePicker } from "./time-zone-picker";

const segment =
  "flex h-8 items-center rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function SegmentButton({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={cn(segment, active ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
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
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/80 p-3 shadow-xs backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-2 sm:pl-4">
      <p className="flex min-w-0 items-center gap-2 text-sm" aria-live="polite">
        <GlobeIcon className="size-4 shrink-0 text-series-accent" aria-hidden />
        {zone ? (
          <span className="min-w-0 truncate">
            <span className="font-semibold">{zone.heading}</span>
            <span className="text-muted-foreground"> · {zone.tz}</span>
          </span>
        ) : (
          <InlineSkeleton className="h-4 w-52" />
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Show times in" className="flex min-w-0 items-center rounded-full bg-muted p-0.5">
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
          <div role="group" aria-label="Temperature unit" className="flex items-center rounded-full bg-muted p-0.5">
            <SegmentButton label="Celsius" active={units.ready && units.value.temp === "c"} onClick={() => setUnits({ ...units.value, temp: "c" })}>
              °C
            </SegmentButton>
            <SegmentButton label="Fahrenheit" active={units.ready && units.value.temp === "f"} onClick={() => setUnits({ ...units.value, temp: "f" })}>
              °F
            </SegmentButton>
          </div>
          <div role="group" aria-label="Wind speed unit" className="flex items-center rounded-full bg-muted p-0.5">
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
