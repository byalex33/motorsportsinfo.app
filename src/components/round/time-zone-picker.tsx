"use client";

import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { filterTimeZones, supportedTimeZones, zoneCity } from "@/lib/time-format";

interface TimeZonePickerProps {
  /** The custom zone when one is active. */
  value: string | null;
  active: boolean;
  onSelect: (tz: string) => void;
  className?: string;
}

/** Searchable list of every IANA zone the browser supports. */
export function TimeZonePicker({ value, active, onSelect, className }: TimeZonePickerProps) {
  const [open, setOpen] = useState(false);
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
      <PopoverTrigger
        aria-pressed={active}
        aria-label={active && value ? `Time zone: ${value}. Choose another time zone` : "Choose another time zone"}
        className={cn(
          "flex h-8 min-w-0 items-center gap-1 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          active ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          className,
        )}
      >
        <span className="truncate">{active && value ? zoneCity(value) : "Other zone"}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </PopoverTrigger>
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
        <ul role="listbox" aria-label="Time zones" className="max-h-72 overflow-y-auto overscroll-contain">
          {results.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted-foreground">No matching time zone</li>}
          {results.map((tz) => {
            const selected = active && tz === value;
            return (
              <li key={tz} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(tz);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted",
                    selected && "font-semibold text-primary",
                  )}
                >
                  <span className="min-w-0 truncate">
                    {zoneCity(tz)}
                    <span className="ml-1.5 text-xs text-muted-foreground">{tz}</span>
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
