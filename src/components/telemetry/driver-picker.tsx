"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowLeftRightIcon, LoaderCircleIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TelemetryDriver } from "@/domain/types";
import { cn } from "@/lib/utils";
import { useComparisonColors } from "./comparison-colors";

interface DriverPickerProps {
  /** The page's path, without the query. */
  path: string;
  /** Classification order. Drivers with no timed lap can't be compared and are disabled. */
  drivers: (TelemetryDriver & { hasLap: boolean })[];
  a: string;
  b: string;
}

/**
 * The two drivers being compared and their colours, kept in the URL (?a=VER&b=RUS&ca=…&cb=…) so a
 * comparison can be shared as it looks. While the server renders a new pair, the current charts stay up.
 */
export function DriverPicker({ path, drivers, a, b }: DriverPickerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { picks } = useComparisonColors();

  function go(nextA: string, nextB: string, colors: { ca?: string | null; cb?: string | null } = {}) {
    const q = new URLSearchParams({ a: nextA, b: nextB });
    if (colors.ca) q.set("ca", colors.ca.slice(1));
    if (colors.cb) q.set("cb", colors.cb.slice(1));
    // The chosen channel stays as it is.
    const ch = new URLSearchParams(window.location.search).get("ch");
    if (ch) q.set("ch", ch);
    startTransition(() => router.replace(`${path}?${q}`, { scroll: false }));
  }
  // A new driver starts from their team colour. Picking the other side's driver swaps the two rather than
  // comparing a driver with themselves; a swap takes each driver's colour with them.
  const pickA = (code: string) => (code === b ? go(b, a, { ca: picks.b, cb: picks.a }) : go(code, b, { cb: picks.b }));
  const pickB = (code: string) => (code === a ? go(b, a, { ca: picks.b, cb: picks.a }) : go(a, code, { ca: picks.a }));

  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2" aria-busy={pending}>
      <DriverSlot label="Driver A" which="a" value={a} drivers={drivers} onChange={pickA} />
      <Button type="button" variant="ghost" size="icon-sm" className="mb-1" onClick={() => go(b, a, { ca: picks.b, cb: picks.a })} aria-label="Swap drivers">
        <ArrowLeftRightIcon aria-hidden />
      </Button>
      <DriverSlot label="Driver B" which="b" value={b} drivers={drivers} onChange={pickB} />
      <span aria-live="polite" className={cn("mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground", !pending && "invisible")}>
        <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden />
        Loading laps
      </span>
    </div>
  );
}

function DriverSlot({
  label,
  which,
  value,
  drivers,
  onChange,
}: {
  label: string;
  which: "a" | "b";
  value: string;
  drivers: DriverPickerProps["drivers"];
  onChange: (code: string) => void;
}) {
  const { palette, team, picks, pick } = useComparisonColors();
  const picked = picks[which];
  // The picker starts from what's drawn: the pick, else the team colour, else the default.
  const swatch = (picked ?? team[which] ?? palette[which].dark).toLowerCase();

  return (
    <div className="grid min-w-0 flex-1 gap-1.5 sm:max-w-80">
      <label htmlFor={`driver-${which}`} className="eyebrow inline-flex items-center gap-1.5 text-muted-foreground">
        <span aria-hidden className={cn("inline-block h-0.5 w-3 rounded-full", which === "a" ? "bg-driver-a" : "driver-b-key bg-driver-b")} />
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-1.5">
        <select
          id={`driver-${which}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            which === "a" ? "border-l-4 border-l-driver-a" : "border-l-4 border-l-driver-b",
          )}
        >
          {drivers.map((d) => (
            <option key={d.number} value={d.code} disabled={!d.hasLap}>
              {d.position ? `P${d.position}` : "NC"} · {d.code} · {d.name}
              {d.hasLap ? "" : " (no timed lap)"}
            </option>
          ))}
        </select>
        <label
          className={cn(
            "relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-input transition-shadow focus-within:ring-2 focus-within:ring-ring",
            which === "a" ? "bg-driver-a" : "bg-driver-b",
          )}
          title={`Colour for ${value}`}
        >
          <span className="sr-only">Colour for {value}</span>
          <input
            type="color"
            value={swatch}
            onChange={(e) => pick(which, e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        {picked && (
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => pick(which, null)} aria-label={`Use ${value}'s team colour`} title="Team colour">
            <RotateCcwIcon aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
