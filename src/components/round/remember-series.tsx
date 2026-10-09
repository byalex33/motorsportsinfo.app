"use client";

import { useEffect } from "react";
import type { SeriesId } from "@/domain/types";
import { PREF_KEYS, writePref } from "@/lib/prefs";

/** Visiting a Series page makes it the remembered Series. */
export function RememberSeries({ series }: { series: SeriesId }) {
  useEffect(() => {
    writePref(PREF_KEYS.series, series);
  }, [series]);
  return null;
}
