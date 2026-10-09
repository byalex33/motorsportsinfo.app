"use client";

import { useRouter } from "next/navigation";
import { useState, type ComponentProps } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useSeriesPref } from "@/lib/prefs";
import { SeriesPicker } from "./series-picker";

/**
 * The picker panel shared by the home modal and the header's Series switcher. Fits small screens:
 * the panel is capped to the viewport and the list scrolls under a fixed title row.
 * Named for the view transition when a Series is picked: the panel scales away over the arriving page.
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

/**
 * The home page is the series picker, shown as a modal. Dismissing it returns the viewer to their
 * last viewed Series; a first-time viewer has to pick one.
 */
export function SeriesPickerDialog() {
  const router = useRouter();
  const { value: remembered } = useSeriesPref();
  const [open, setOpen] = useState(true);

  function onOpenChange(next: boolean) {
    if (next) return setOpen(true);
    if (!remembered) return;
    setOpen(false);
    router.push(`/${remembered}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SeriesPickerContent showCloseButton={Boolean(remembered)} />
    </Dialog>
  );
}
