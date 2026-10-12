"use client";

import { BellIcon, CalendarDaysIcon, ChevronDownIcon, ChevronsUpDownIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, ViewTransition, type ReactElement, type ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { SeriesPickerContent } from "@/components/series-picker-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MAIN_SERIES_IDS, OTHER_SERIES_IDS, SERIES } from "@/domain/series";
import type { SeriesId } from "@/domain/types";
import { isSeriesId } from "@/lib/series-id";
import { cn } from "@/lib/utils";

const navLink =
  "group/nav relative flex h-14 items-center gap-1.5 px-2 text-sm font-medium tracking-tight whitespace-nowrap transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset lg:px-2.5";

/**
 * The active Series underline. On a route change between Series the old and new underlines share a
 * view-transition name, so the browser morphs one into the other: it slides between nav items on a
 * spring while its colour cross-fades to the new Series accent. With no partner (to or from a
 * non-Series page) it pops in or fades out.
 */
function ActiveUnderline({ children }: { children: ReactElement }) {
  return (
    <ViewTransition name="series-nav-underline" share="nav-indicator" enter="nav-indicator-in" exit="nav-indicator-out" default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * The active Series dot pops into the new item. It leaves with the old header snapshot (instantly),
 * so it never slides or fades across the labels as they reflow.
 */
function ActiveDot({ children }: { children: ReactElement }) {
  return (
    <ViewTransition enter="nav-indicator-in" exit="none" default="none">
      {children}
    </ViewTransition>
  );
}

/** The active Series' dot before its label and underline below it. */
function ActiveMarks({ children }: { children: ReactNode }) {
  return (
    <>
      <ActiveDot>
        <span aria-hidden className="inline-block size-1.5 rounded-full bg-series-gradient" />
      </ActiveDot>
      {children}
      <ActiveUnderline>
        <span
          aria-hidden
          className="absolute inset-x-2 -bottom-px h-0.5 bg-series-gradient group-focus-visible/nav:hidden lg:inset-x-2.5"
        />
      </ActiveUnderline>
    </>
  );
}

/**
 * Tablet and up: the main Series as text links, with the sliding active underline, then an Other menu for
 * the rest. On one of those Series the Other item carries the active dot and underline in its colour.
 */
function SeriesNav({ current }: { current: SeriesId | null }) {
  const otherCurrent = current && SERIES[current].group === "other" ? current : null;
  return (
    <nav aria-label="Series" className="hidden min-w-0 sm:block lg:ml-2">
      <ul className="flex items-center">
        {MAIN_SERIES_IDS.map((id) => {
          const active = current === id;
          return (
            <li key={id} data-series={id}>
              <Link
                href={`/${id}`}
                prefetch
                aria-current={active ? "page" : undefined}
                title={SERIES[id].name}
                className={cn(navLink, active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {active ? <ActiveMarks>{SERIES[id].shortName}</ActiveMarks> : SERIES[id].shortName}
              </Link>
            </li>
          );
        })}
        <li data-series={otherCurrent ?? undefined}>
          <OtherSeriesMenu current={otherCurrent} />
        </li>
      </ul>
    </nav>
  );
}

/** The Other menu: a button that opens the remaining Series as links. */
function OtherSeriesMenu({ current }: { current: SeriesId | null }) {
  const [open, setOpen] = useState(false);
  const label = (
    <>
      Other
      <ChevronDownIcon
        aria-hidden
        className={cn("size-3.5 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
      />
    </>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={current ? `Other Series (viewing ${SERIES[current].name})` : "Other Series"}
        className={cn(
          navLink,
          "cursor-pointer",
          current || open ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {current ? <ActiveMarks>{label}</ActiveMarks> : label}
      </PopoverTrigger>
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

/**
 * Phones: the Series links don't fit at 360px, so the header shows the active Series (with its dot) as a
 * button that opens the Series picker. The dot pops in again when the Series changes.
 */
function SeriesSwitcher({ current }: { current: SeriesId | null }) {
  const [open, setOpen] = useState(false);
  const info = current ? SERIES[current] : null;

  return (
    <nav aria-label="Series" className="min-w-0 sm:hidden">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          data-series={current ?? undefined}
          aria-label={
            info
              ? `${info.shortName}${info.name !== info.shortName ? ` (${info.name})` : ""} — choose another Series`
              : "Series — choose a Series"
          }
          className="flex h-9 min-w-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium tracking-tight text-foreground transition-[background-color,scale] duration-200 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring active:scale-95 data-popup-open:bg-muted"
        >
          {info && (
            <ActiveDot key={current}>
              <span aria-hidden className="inline-block size-1.5 shrink-0 rounded-full bg-series-gradient" />
            </ActiveDot>
          )}
          <span className="truncate">{info ? info.shortName : "Series"}</span>
          <ChevronsUpDownIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        </DialogTrigger>
        <SeriesPickerContent current={current} onNavigate={() => setOpen(false)} />
      </Dialog>
    </nav>
  );
}

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const segment = pathname.split("/")[1] ?? "";
  const current = isSeriesId(segment) ? segment : null;

  return (
    // Named so route-change view transitions keep the header still above the cross-fading page.
    <header className="sticky top-0 z-40 border-b border-border bg-background [view-transition-name:site-header]">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:gap-4">
        <Link
          href="/"
          className="group/brand flex shrink-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="motorsportsinfo.app home — choose a Series"
        >
          <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground transition-transform duration-300 ease-spring group-hover/brand:-rotate-6 group-active/brand:scale-95">
            <BrandMark className="size-[18px]" />
          </span>
          <span className="hidden text-[0.95rem] font-semibold tracking-tight text-foreground lg:inline">
            motorsportsinfo<span className="text-muted-foreground">.app</span>
          </span>
        </Link>

        <SeriesSwitcher current={current} />
        <SeriesNav current={current} />

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Link
            href="/calendar"
            prefetch
            aria-current={segment === "calendar" ? "page" : undefined}
            aria-label="Calendar"
            className={cn(
              "flex size-8 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-[color,background-color,scale] duration-200 outline-none hover:bg-muted active:scale-95 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:px-2.5",
              segment === "calendar" ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <CalendarDaysIcon className="size-4 sm:hidden" aria-hidden />
            <span className="hidden sm:inline">Calendar</span>
          </Link>
          <Link
            href="/alerts"
            aria-current={segment === "alerts" ? "page" : undefined}
            aria-label="Alerts and calendar"
            className={cn(
              "flex size-8 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-[color,background-color,scale] duration-200 outline-none hover:bg-muted active:scale-95 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:px-2.5",
              segment === "alerts" ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <BellIcon className="size-4 sm:hidden" aria-hidden />
            <span className="hidden sm:inline">Alerts</span>
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
