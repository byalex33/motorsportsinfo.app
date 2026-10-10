"use client";

import { useState, type PointerEvent } from "react";
import type { TelemetryDriver, TelemetryLap } from "@/domain/types";
import { formatLapTime } from "@/lib/lap-time";
import { cn } from "@/lib/utils";
import { SeriesKey } from "./lap-traces";
import { useWidth } from "./use-width";
import { Watermark } from "./watermark";

const ML = 52;
const MR = 12;
const HEIGHT = 220;
const AXIS = 22;
/** Laps slower than this share of the best lap (out-laps, in-laps, cool-down laps) would flatten the chart. */
const SLOW = 1.1;

interface LapTimesChartProps {
  a: TelemetryDriver;
  b: TelemetryDriver;
  lapsA: TelemetryLap[];
  lapsB: TelemetryLap[];
  /** The laps compared above, ringed. */
  comparedA: number | null;
  comparedB: number | null;
}

/** Every timed lap of both drivers through the Session, with a crosshair that snaps to a lap number. */
export function LapTimesChart({ a, b, lapsA, lapsB, comparedA, comparedB }: LapTimesChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const timed = (laps: TelemetryLap[]) => laps.filter((l) => l.time !== null && !l.pitOut) as (TelemetryLap & { time: number })[];
  const allA = timed(lapsA);
  const allB = timed(lapsB);
  const best = Math.min(...allA.map((l) => l.time), ...allB.map((l) => l.time));
  if (!Number.isFinite(best)) return <p className="text-sm text-muted-foreground">Neither driver set a timed lap.</p>;

  const shownA = allA.filter((l) => l.time <= best * SLOW);
  const shownB = allB.filter((l) => l.time <= best * SLOW);
  const hidden = lapsA.length + lapsB.length - shownA.length - shownB.length;
  const maxLap = Math.max(1, ...lapsA.map((l) => l.lap), ...lapsB.map((l) => l.lap));
  const slowest = Math.max(...shownA.map((l) => l.time), ...shownB.map((l) => l.time));
  const lo = Math.floor(best - 0.5);
  const hi = Math.ceil(slowest + 0.5);
  const tickStep = hi - lo > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += tickStep) ticks.push(t);

  const plotW = Math.max(0, width - ML - MR);
  const x = (lap: number) => ML + (maxLap === 1 ? plotW / 2 : ((lap - 1) / (maxLap - 1)) * plotW);
  const y = (t: number) => 8 + ((t - lo) / (hi - lo)) * (HEIGHT - AXIS - 16);
  const lapTicks = Array.from({ length: maxLap }, (_, i) => i + 1).filter((l) => l === 1 || l % (maxLap > 30 ? 10 : 5) === 0);

  function onPointer(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - rect.left - ML) / plotW;
    setHover(f < -0.05 || f > 1.05 ? null : Math.min(maxLap, Math.max(1, Math.round(1 + f * (maxLap - 1)))));
  }

  const timeOf = (laps: TelemetryLap[], lap: number) => laps.find((l) => l.lap === lap);
  const label = (l: TelemetryLap | undefined) => (!l ? "—" : l.pitOut ? "Out lap" : l.time === null ? "No time" : formatLapTime(l.time));

  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="eyebrow text-muted-foreground">Lap times</span>
        <span className="flex flex-wrap items-center justify-end gap-x-3 font-mono text-xs tabular text-muted-foreground">
          {hover !== null && <span>Lap {hover}</span>}
          {[
            { d: a, laps: lapsA, which: "a" as const, compared: comparedA },
            { d: b, laps: lapsB, which: "b" as const, compared: comparedB },
          ].map(({ d, laps, which, compared }) => (
            <span key={which} className="inline-flex items-center gap-1.5">
              <SeriesKey which={which} />
              <span className="font-semibold text-foreground">{label(timeOf(laps, hover ?? compared ?? -1))}</span>
              <span>{d.code}</span>
            </span>
          ))}
        </span>
      </figcaption>
      <div
        ref={ref}
        className="relative isolate touch-pan-y select-none"
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHover(null)}
      >
        <Watermark />
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Lap times through the Session for ${a.code} and ${b.code}; quicker laps are higher.`}
            className="block overflow-visible"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={ML} x2={width - MR} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
                <text x={ML - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">
                  {formatLapTime(t).replace(/\.000$/, "")}
                </text>
              </g>
            ))}
            <line x1={ML} x2={width - MR} y1={HEIGHT - AXIS} y2={HEIGHT - AXIS} className="stroke-border" strokeWidth={1} />
            {lapTicks.map((l) => (
              <text key={l} x={x(l)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">
                {l === 1 ? "Lap 1" : l}
              </text>
            ))}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={HEIGHT - AXIS} className="stroke-foreground/40" strokeWidth={1} />}
            <Series laps={shownB} which="b" x={x} y={y} compared={comparedB} hover={hover} />
            <Series laps={shownA} which="a" x={x} y={y} compared={comparedA} hover={hover} />
          </svg>
        )}
      </div>
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          {hidden} slower lap{hidden === 1 ? "" : "s"} (out-laps, in-laps and cool-down laps) left out.
        </p>
      )}
    </figure>
  );
}

function Series({
  laps,
  which,
  x,
  y,
  compared,
  hover,
}: {
  laps: (TelemetryLap & { time: number })[];
  which: "a" | "b";
  x: (lap: number) => number;
  y: (t: number) => number;
  compared: number | null;
  hover: number | null;
}) {
  // Lines only join consecutive laps, so a gap (a slow lap left out) stays a gap.
  let d = "";
  laps.forEach((l, i) => {
    const joined = i > 0 && laps[i - 1].lap === l.lap - 1;
    d += `${joined ? "L" : "M"}${x(l.lap).toFixed(1)},${y(l.time).toFixed(1)}`;
  });
  const stroke = which === "a" ? "stroke-driver-a" : "driver-b-line stroke-driver-b";
  return (
    <g>
      <path d={d} fill="none" className={stroke} strokeWidth={1.5} strokeLinejoin="round" />
      {laps.map((l) => (
        <g key={l.lap}>
          {l.lap === compared && <circle cx={x(l.lap)} cy={y(l.time)} r={8} fill="none" className={stroke} strokeWidth={1.5} />}
          <circle
            cx={x(l.lap)}
            cy={y(l.time)}
            r={hover === l.lap ? 5 : 4}
            strokeWidth={2}
            className={cn("stroke-background", which === "a" ? "fill-driver-a" : "fill-driver-b")}
          />
        </g>
      ))}
    </g>
  );
}
