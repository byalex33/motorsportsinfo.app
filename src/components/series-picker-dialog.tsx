"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useSeriesPref } from "@/lib/prefs";
import { SeriesPicker } from "./series-picker";

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
      <DialogContent showCloseButton={Boolean(remembered)} className="gap-0 p-0 sm:max-w-lg">
        <div className="flex items-baseline justify-between border-b border-border px-4 py-3 pr-12">
          <DialogTitle className="eyebrow text-muted-foreground">Choose a Series</DialogTitle>
        </div>
        <SeriesPicker compact />
      </DialogContent>
    </Dialog>
  );
}
