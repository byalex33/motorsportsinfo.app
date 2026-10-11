"use client";

import { BellIcon, CalendarDaysIcon, ChevronsUpDownIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, ViewTransition, type ReactElement } from "react";
import { BrandMark } from "@/components/brand-mark";
import { SeriesPickerContent } from "@/components/series-picker-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { SERIES } from "@/domain/series";
import { SERIES_IDS, type SeriesId } from "@/domain/types";
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

/** Tablet and up: every Series as a text link, with the sliding active underline. */
function SeriesNav({ current }: { current: SeriesId | null }) {
  return (
    <nav aria-label="Series" className="hidden min-w-0 sm:block lg:ml-2">
      <ul className="flex items-center">
        {SERIES_IDS.map((id) => {
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
                {active && (
                  <ActiveDot>
                    <span aria-hidden className="inline-block size-1.5 rounded-full bg-series-gradient" />
                  </ActiveDot>
                )}
                {SERIES[id].shortName}
                {active && (
                  <ActiveUnderline>
                    <span
                      aria-hidden
                      className="absolute inset-x-2 -bottom-px h-0.5 bg-series-gradient group-focus-visible/nav:hidden lg:inset-x-2.5"
                    />
                  </ActiveUnderline>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Phones: seven links don't fit at 360px, so the header shows the active Series (with its dot) as a
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
          aria-label={info ? `${info.shortName} (${info.name}) — choose another Series` : "Series — choose a Series"}
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
