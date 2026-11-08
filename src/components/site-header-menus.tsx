"use client";
// The header's two popups, loaded after the page is interactive (see deferred-popup.ts). Until then
// site-header.tsx renders their triggers as stand-in buttons with the same look.

import Link from "next/link";
import { useState } from "react";
import { focusOnMount, type DeferredPopupProps } from "@/components/deferred-popup";
import { SeriesPickerContent } from "@/components/series-picker-dialog";
import { otherMenuTrigger, seriesSwitcherTrigger } from "@/components/site-header";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OTHER_SERIES_IDS, SERIES } from "@/domain/series";
import type { SeriesId } from "@/domain/types";
import { cn } from "@/lib/utils";

/** The Other menu: a button that opens the remaining Series as links. */
export function OtherSeriesMenu({ current, defaultOpen = false, focusTrigger = false }: { current: SeriesId | null } & DeferredPopupProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger ref={focusTrigger ? focusOnMount : undefined} {...otherMenuTrigger(current, open)} />
      <PopoverContent align="start" sideOffset={2} className="w-64 gap-0 p-1">
        <ul>
          {OTHER_SERIES_IDS.map((id) => {
            const active = current === id;
            return (
              <li key={id} data-series={id}>
                <Link
                  href={`/${id}`}
                  prefetch
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                    active && "bg-muted",
                  )}
                >
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-series-gradient" />
                  <span className="min-w-0">
                    <span className="block font-medium tracking-tight text-foreground">{SERIES[id].shortName}</span>
                    {SERIES[id].name !== SERIES[id].shortName && (
                      <span className="block truncate text-xs text-muted-foreground">{SERIES[id].name}</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Phones: the active Series as a button that opens the Series picker. */
export function SeriesSwitcherDialog({ current, defaultOpen = false, focusTrigger = false }: { current: SeriesId | null } & DeferredPopupProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger ref={focusTrigger ? focusOnMount : undefined} {...seriesSwitcherTrigger(current)} />
      <SeriesPickerContent current={current} onNavigate={() => setOpen(false)} />
    </Dialog>
  );
}
