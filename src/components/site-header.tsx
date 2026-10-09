"use client";

import { BellIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { SERIES } from "@/domain/series";
import { SERIES_IDS } from "@/domain/types";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const current = pathname.split("/")[1] ?? "";

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-3 sm:gap-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-lg py-1 pr-1 text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="motorsportsinfo.app home — choose a Series"
        >
          <BrandMark className="size-7" />
          <span className="hidden text-[0.95rem] font-semibold tracking-tight text-foreground md:inline">
            motorsportsinfo<span className="text-muted-foreground">.app</span>
          </span>
        </Link>

        <nav aria-label="Series" className="mx-auto flex min-w-0 items-center sm:mx-0 sm:ml-auto">
          <ul className="flex items-center gap-0.5 rounded-full border border-border bg-card/70 p-0.5 shadow-xs sm:gap-1 sm:p-1">
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
                      "flex h-8 min-w-11 items-center justify-center gap-1.5 rounded-full px-2.5 text-[0.8rem] font-semibold tracking-tight transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-3.5 sm:text-sm",
                      active
                        ? "bg-series-accent text-series-accent-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "hidden size-1.5 rounded-full sm:inline-block",
                        active ? "bg-series-accent-foreground/80" : "bg-series-accent",
                      )}
                    />
                    {SERIES[id].shortName}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-0.5 sm:ml-0">
          <Link
            href="/alerts"
            aria-current={current === "alerts" ? "page" : undefined}
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "sm:w-auto sm:px-2.5")}
            aria-label="Alerts and calendar"
          >
            <BellIcon aria-hidden />
            <span className="hidden sm:inline">Alerts</span>
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
