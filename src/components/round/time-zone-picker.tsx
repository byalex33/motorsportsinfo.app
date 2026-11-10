"use client";

import { ChevronDownIcon } from "lucide-react";
import { deferredLoader, useDeferredPopup } from "@/components/deferred-popup";
import { segmentItem, segmentItemState } from "@/components/motion/segment-pill";
import { cn } from "@/lib/utils";
import { zoneCity } from "@/lib/time-format";

export interface TimeZonePickerProps {
  /** The custom zone when one is active. */
  value: string | null;
  active: boolean;
  onSelect: (tz: string) => void;
  className?: string;
}

/** The picker button's label and look, shared by its stand-in and the loaded popover (time-zone-popover.tsx). */
export function timeZoneTrigger({ value, active, className }: TimeZonePickerProps) {
  return {
    "aria-pressed": active,
    "aria-label": active && value ? `Time zone: ${value}. Choose another time zone` : "Choose another time zone",
    className: cn(segmentItem, "min-w-0 gap-1", segmentItemState(active), className),
    children: (
      <>
        <span className="truncate">{active && value ? zoneCity(value) : "Other zone"}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-70 transition-transform duration-300 ease-spring in-data-popup-open:rotate-180" aria-hidden />
      </>
    ),
  };
}

// The Popover loads after the page is interactive (deferred-popup.ts).
const loadPopover = deferredLoader(() => import("./time-zone-popover"));

/** Searchable list of every IANA zone the browser supports. */
export function TimeZonePicker(props: TimeZonePickerProps) {
  const { popup, mount, triggerProps } = useDeferredPopup(loadPopover);
  if (popup) return <popup.TimeZonePopover {...props} {...mount} />;
  return <button {...triggerProps} {...timeZoneTrigger(props)} />;
}
