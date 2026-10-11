"use client";

import type { ComponentProps } from "react";
import { DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SeriesPicker } from "./series-picker";

/**
 * The header's Series switcher panel (phones). Fits small screens: the panel is capped to the
 * viewport and the list scrolls under a fixed title row. Named for the view transition when a Series
 * is picked: the panel scales away over the arriving page. The home page shows the full picker
 * inline instead.
 */
export function SeriesPickerContent({
  className,
  current,
  onNavigate,
  ...props
}: ComponentProps<typeof DialogContent> & Pick<ComponentProps<typeof SeriesPicker>, "current" | "onNavigate">) {
  return (
    <DialogContent
      {...props}
      className={cn(
        "max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 [view-transition-name:series-picker] sm:max-w-lg",
        className,
      )}
    >
      <div className="flex items-baseline justify-between border-b border-border px-4 py-3 pr-12">
        <DialogTitle className="eyebrow text-muted-foreground">Choose a Series</DialogTitle>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        <SeriesPicker compact current={current} onNavigate={onNavigate} />
      </div>
    </DialogContent>
  );
}
