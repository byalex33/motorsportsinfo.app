"use client";

import { BellIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { SERIES } from "@/domain/series";
import { SERIES_IDS } from "@/domain/types";
import { cn } from "@/lib/utils";

const navLink =
  "relative flex h-14 items-center gap-1.5 px-2 text-sm font-medium tracking-tight transition-colors outline-none focus-visible:after:hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-2.5";

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const current = pathname.split("/")[1] ?? "";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-3 sm:gap-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="motorsportsinfo.app home — choose a Series"
        >
          <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <BrandMark className="size-[18px]" />
          </span>
          <span className="hidden text-[0.95rem] font-semibold tracking-tight text-foreground sm:inline">
            motorsportsinfo<span className="text-muted-foreground">.app</span>
          </span>
        </Link>

        <nav aria-label="Series" className="min-w-0 sm:ml-2">
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
                    className={cn(
                      navLink,
                      active
                        ? "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-series-accent sm:after:inset-x-2.5"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn("size-1.5 rounded-full bg-series-accent", active ? "inline-block" : "hidden")}
                    />
                    {SERIES[id].shortName}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Link
            href="/alerts"
            aria-current={current === "alerts" ? "page" : undefined}
            aria-label="Alerts and calendar"
            className={cn(
              "flex size-8 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:px-2.5",
              current === "alerts" ? "text-foreground" : "text-muted-foreground",
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
