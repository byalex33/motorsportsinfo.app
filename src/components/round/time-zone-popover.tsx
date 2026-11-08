"use client";
// The time zone picker's popover, loaded after the page is interactive (see deferred-popup.ts). Until then
// time-zone-picker.tsx renders its trigger as a stand-in button with the same look.

import { CheckIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { focusOnMount, type DeferredPopupProps } from "@/components/deferred-popup";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { filterTimeZones, supportedTimeZones, zoneCity } from "@/lib/time-format";
import { timeZoneTrigger, type TimeZonePickerProps } from "./time-zone-picker";

/** Searchable list of every IANA zone the browser supports. */
export function TimeZonePopover({ defaultOpen = false, focusTrigger = false, ...props }: TimeZonePickerProps & DeferredPopupProps) {
  const { value, active, onSelect } = props;
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const zones = useMemo(() => (open ? supportedTimeZones() : []), [open]);
  const results = useMemo(() => filterTimeZones(zones, query, 100), [zones, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger ref={focusTrigger ? focusOnMount : undefined} {...timeZoneTrigger(props)} />
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] gap-2 p-2">
        <label className="relative block">
          <span className="sr-only">Search time zones</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, e.g. Tokyo or New York"
            className="h-9 pl-8"
          />
        </label>
        {/* A plain list of buttons: the chosen zone is the pressed one. */}
        <ul aria-label="Time zones" className="max-h-72 overflow-y-auto overscroll-contain">
          {results.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted-foreground">No matching time zone</li>}
          {results.map((tz) => {
            const selected = active && tz === value;
            return (
              <li key={tz}>
                <button
                  type="button"
                  aria-pressed={selected || undefined}
                  onClick={() => {
                    onSelect(tz);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted",
                    selected && "font-medium text-primary",
                  )}
                >
                  <span className="min-w-0 truncate">
                    {zoneCity(tz)}
                    <span className="ml-1.5 font-mono text-xs text-muted-foreground">{tz}</span>
                  </span>
                  {selected && <CheckIcon className="size-4 shrink-0" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
