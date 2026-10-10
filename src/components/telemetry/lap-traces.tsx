"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { LapComparison, TelemetryDriver } from "@/domain/types";
import { SegmentPill } from "@/components/motion/segment-pill";
import { SegmentButton, segmentTrack } from "@/components/round/display-controls";
import { CHANNEL_LABELS, TELEMETRY_CHANNELS, type TelemetryChannel } from "@/lib/telemetry-channels";
import { cn } from "@/lib/utils";
import { useWidth } from "./use-width";
import { Watermark } from "./watermark";

// The chosen channel (pills: speed, throttle, brake, gear) and the gap share one distance axis and one
// crosshair, which also moves the marker on the track map. One measure per chart, never two y-scales.

const ML = 40; // left margin: y-axis labels
const MR = 8;

interface LapTracesProps {
  comparison: LapComparison;
  a: TelemetryDriver;
  b: TelemetryDriver;
  /** From ?ch=, so a shared link opens on the same channel. */
  initialChannel: TelemetryChannel;
}

export function LapTraces({ comparison, a, b, initialChannel }: LapTracesProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [channel, setChannel] = useState(initialChannel);
  const [ref, width] = useWidth<HTMLDivElement>();
  const last = comparison.distance.length - 1;
  const length = comparison.distance[last];
  const plotW = Math.max(0, width - ML - MR);
  const x = (i: number) => ML + (comparison.distance[i] / length) * plotW;

  function choose(next: TelemetryChannel) {
    setChannel(next);
    // Kept in the URL without a reload, so sharing (link or image) shows this channel.
    const url = new URL(window.location.href);
    if (next === "speed") url.searchParams.delete("ch");
    else url.searchParams.set("ch", next);
    window.history.replaceState(window.history.state, "", url);
  }
  function onPointer(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - rect.left - ML) / plotW;
    setHover(f < 0 || f > 1 ? null : Math.round(f * last));
  }
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const stepBy = Math.max(1, Math.round(last / 100));
    if (e.key === "ArrowRight") setHover((h) => Math.min(last, (h ?? -stepBy) + stepBy));
    else if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? last + stepBy) - stepBy));
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  }

  const codes = [a.code, b.code] as const;
  const trace = channelTrace(channel, comparison, codes, hover);

  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-5">
        <div role="group" aria-label="Car data to show" className={cn(segmentTrack, "w-fit max-w-full overflow-x-auto")}>
          <SegmentPill />
          {TELEMETRY_CHANNELS.map((c) => (
            <SegmentButton key={c} active={channel === c} onClick={() => choose(c)}>
              {CHANNEL_LABELS[c]}
            </SegmentButton>
          ))}
        </div>
        <div
          ref={ref}
          tabIndex={0}
          role="group"
          aria-label={`${CHANNEL_LABELS[channel]} and gap for ${a.code} and ${b.code}. Use the left and right arrow keys to move along the lap.`}
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          className="relative isolate min-w-0 touch-pan-y space-y-5 rounded-md outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Watermark />
          {width > 0 && (
            <>
              <Trace key={channel} {...trace} x={x} width={width} hover={hover} />
              <DeltaTrace comparison={comparison} codes={codes} x={x} width={width} length={length} hover={hover} />
            </>
          )}
        </div>
      </div>

      <TrackMap comparison={comparison} codes={codes} hover={hover} onHover={setHover} />
    </div>
  );
}

/** What the chosen channel's chart draws, and what its readout says (a summary, or the values under the crosshair). */
function channelTrace(
  channel: TelemetryChannel,
  c: LapComparison,
  codes: readonly [string, string],
  at: number | null,
): Omit<TraceProps, "x" | "width" | "hover"> {
  const share = (values: number[], test: (v: number) => boolean) => Math.round((values.filter(test).length / values.length) * 100);
  switch (channel) {
    case "speed": {
      const domain = niceDomain([...c.a.speed, ...c.b.speed], 50, 0);
      return {
        title: "Speed",
        values: [c.a.speed, c.b.speed],
        domain,
        ticks: ticksIn(domain, 50),
        height: 240,
        readout:
          at === null ? (
            <Readout label="Top" codes={codes} values={[max(c.a.speed), max(c.b.speed)]} unit="km/h" />
          ) : (
            <Readout codes={codes} values={[c.a.speed[at], c.b.speed[at]]} unit="km/h" />
          ),
        summary: `Speed through the lap. Top speed ${codes[0]} ${max(c.a.speed)} km/h, ${codes[1]} ${max(c.b.speed)} km/h.`,
      };
    }
    case "throttle":
      return {
        title: "Throttle",
        values: [c.a.throttle, c.b.throttle],
        domain: [0, 100],
        ticks: [0, 25, 50, 75, 100],
        height: 200,
        readout:
          at === null ? (
            <Readout label="Flat out" codes={codes} values={[share(c.a.throttle, (v) => v >= 98), share(c.b.throttle, (v) => v >= 98)]} unit="% of lap" />
          ) : (
            <Readout codes={codes} values={[c.a.throttle[at], c.b.throttle[at]]} unit="%" />
          ),
        summary: "Throttle through the lap, 0 to 100 percent.",
      };
    case "brake":
      return {
        title: "Brake",
        values: [c.a.brake, c.b.brake],
        domain: [0, 100],
        ticks: [0, 100],
        tickFormat: (v) => (v === 0 ? "Off" : "On"),
        step: true,
        height: 140,
        readout:
          at === null ? (
            <Readout label="Braking" codes={codes} values={[share(c.a.brake, (v) => v > 0), share(c.b.brake, (v) => v > 0)]} unit="% of lap" />
          ) : (
            <Readout codes={codes} values={[c.a.brake[at] > 0 ? "On" : "Off", c.b.brake[at] > 0 ? "On" : "Off"]} />
          ),
        summary: "When each driver is on the brake.",
      };
    case "gear":
      return {
        title: "Gear",
        values: [c.a.gear, c.b.gear],
        // 0 is neutral (a car stopped or crawling).
        domain: [0, 8],
        ticks: [0, 2, 4, 6, 8],
        step: true,
        height: 200,
        readout: at === null ? null : <Readout codes={codes} values={[c.a.gear[at], c.b.gear[at]]} />,
        summary: "Gear through the lap, 1 to 8 (0 is neutral).",
      };
  }
}

/** "VER 287 · RUS 279 km/h", each code keyed by a short stroke of its colour. Values lead, in text colours. */
function Readout({ label, codes, values, unit }: { label?: string; codes: readonly [string, string]; values: [number | string, number | string]; unit?: string }) {
  return (
    <span className="flex flex-wrap items-center justify-end gap-x-3 font-mono text-xs tabular text-muted-foreground">
      {label && <span>{label}</span>}
      {codes.map((code, i) => (
        <span key={code + i} className="inline-flex items-center gap-1.5">
          <SeriesKey which={i === 0 ? "a" : "b"} />
          <span className="font-semibold text-foreground">{values[i]}</span>
          <span>{code}</span>
        </span>
      ))}
      {unit && <span>{unit}</span>}
    </span>
  );
}

export function SeriesKey({ which }: { which: "a" | "b" }) {
  return <span aria-hidden className={cn("inline-block h-0.5 w-3 rounded-full", which === "a" ? "bg-driver-a" : "driver-b-key bg-driver-b")} />;
}

interface TraceProps {
  title: string;
  values: [number[], number[]];
  domain: [number, number];
  ticks: number[];
  tickFormat?: (v: number) => string;
  /** Hold each value until the next (gear, brake) instead of drawing slopes between them. */
  step?: boolean;
  height: number;
  x: (i: number) => number;
  width: number;
  hover: number | null;
  readout: ReactNode;
  summary: string;
}

function Trace({ title, values, domain, ticks, tickFormat = String, step, height, x, width, hover, readout, summary }: TraceProps) {
  const top = 6;
  const bottom = height - 6;
  // Clamped, so a stray value can never draw outside the chart.
  const y = (v: number) => bottom - ((Math.min(domain[1], Math.max(domain[0], v)) - domain[0]) / (domain[1] - domain[0])) * (bottom - top);

  return (
    <figure className="space-y-1.5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="eyebrow text-muted-foreground">{title}</span>
        {readout}
      </figcaption>
      <svg width={width} height={height} role="img" aria-label={summary} className="block overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={ML} x2={width - MR} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={ML - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">
              {tickFormat(t)}
            </text>
          </g>
        ))}
        <path d={linePath(values[1], x, y, step)} fill="none" className="driver-b-line stroke-driver-b" strokeWidth={1.75} strokeLinejoin="round" />
        <path d={linePath(values[0], x, y, step)} fill="none" className="stroke-driver-a" strokeWidth={1.75} strokeLinejoin="round" />
        {hover !== null && <Crosshair x={x(hover)} top={0} bottom={height} dots={[y(values[0][hover]), y(values[1][hover])]} />}
      </svg>
    </figure>
  );
}

function DeltaTrace({
  comparison,
  codes,
  x,
  width,
  length,
  hover,
}: {
  comparison: LapComparison;
  codes: readonly [string, string];
  x: (i: number) => number;
  width: number;
  length: number;
  hover: number | null;
}) {
  const clip = useId();
  const height = 130;
  const axis = 22;
  const top = 6;
  const bottom = height - axis - 6;
  const { delta } = comparison;
  const m = Math.max(0.1, ...delta.map(Math.abs)) * 1.15;
  const y = (v: number) => top + ((m - v) / (2 * m)) * (bottom - top);
  const zero = y(0);
  const line = linePath(delta, x, y, false);
  const area = `${line}L${x(delta.length - 1)},${zero}L${x(0)},${zero}Z`;
  const lead = (v: number) => (Math.abs(v) < 0.0005 ? "Level" : `${v > 0 ? codes[0] : codes[1]} ahead by ${Math.abs(v).toFixed(3)} s`);
  const final = delta[delta.length - 1];
  const kmTicks: number[] = [];
  for (let d = 0; d <= length; d += 1000) kmTicks.push(d);
  const xd = (d: number) => ML + (d / length) * (width - ML - MR);

  return (
    <figure className="space-y-1.5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="eyebrow text-muted-foreground">Gap</span>
        <span className="font-mono text-xs tabular text-muted-foreground">
          {hover === null ? (
            <>
              At the line: <span className="font-semibold text-foreground">{lead(final)}</span>
            </>
          ) : (
            <span className="font-semibold text-foreground">{lead(delta[hover])}</span>
          )}
        </span>
      </figcaption>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Running gap through the lap. Above the line ${codes[0]} is ahead, below it ${codes[1]}. At the line: ${lead(final)}.`}
        className="block overflow-visible"
      >
        <defs>
          <clipPath id={`${clip}-above`}>
            <rect x={0} y={0} width={width} height={zero} />
          </clipPath>
          <clipPath id={`${clip}-below`}>
            <rect x={0} y={zero} width={width} height={height} />
          </clipPath>
        </defs>
        <path d={area} className="fill-driver-a/15" clipPath={`url(#${clip}-above)`} />
        <path d={area} className="fill-driver-b/15" clipPath={`url(#${clip}-below)`} />
        <line x1={ML} x2={width - MR} y1={zero} y2={zero} className="stroke-muted-foreground/50" strokeWidth={1} />
        <text x={ML + 6} y={top + 10} className="fill-muted-foreground font-mono text-[10px]">
          {codes[0]} ahead
        </text>
        <text x={ML + 6} y={bottom - 4} className="fill-muted-foreground font-mono text-[10px]">
          {codes[1]} ahead
        </text>
        <path d={line} fill="none" className="stroke-foreground" strokeWidth={1.5} strokeLinejoin="round" />
        {kmTicks.map((d) => (
          <text key={d} x={xd(d)} y={height - 6} textAnchor={d === 0 ? "start" : "middle"} className="fill-muted-foreground font-mono text-[10px]">
            {d === 0 ? "0" : `${d / 1000} km`}
          </text>
        ))}
        <line x1={ML} x2={width - MR} y1={height - axis} y2={height - axis} className="stroke-border" strokeWidth={1} />
        {hover !== null && <Crosshair x={x(hover)} top={0} bottom={height - axis} dots={[y(delta[hover])]} neutral />}
      </svg>
    </figure>
  );
}

function Crosshair({ x, top, bottom, dots, neutral }: { x: number; top: number; bottom: number; dots: number[]; neutral?: boolean }) {
  return (
    <g pointerEvents="none">
      <line x1={x} x2={x} y1={top} y2={bottom} className="stroke-foreground/40" strokeWidth={1} />
      {dots.map((cy, i) => (
        <circle
          key={i}
          cx={x}
          cy={cy}
          r={4}
          strokeWidth={2}
          className={cn("stroke-background", neutral ? "fill-foreground" : i === 0 ? "fill-driver-a" : "fill-driver-b")}
        />
      ))}
    </g>
  );
}

function TrackMap({
  comparison,
  codes,
  hover,
  onHover,
}: {
  comparison: LapComparison;
  codes: readonly [string, string];
  hover: number | null;
  onHover: (i: number | null) => void;
}) {
  const { x, miniSectors } = comparison;
  if (x.length === 0) {
    return <p className="text-sm text-muted-foreground lg:pt-6">The track map needs position data, which OpenF1 doesn&apos;t have for this lap.</p>;
  }
  // SVG's y grows downwards; OpenF1's grows upwards.
  const y = comparison.y.map((v) => -v);
  const minX = Math.min(...x);
  const maxX = Math.max(...x);
  const minY = Math.min(...y);
  const maxY = Math.max(...y);
  const extent = Math.max(maxX - minX, maxY - minY);
  const pad = extent * 0.06;
  const view = `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`;
  const points = (from: number, to: number) => {
    let s = "";
    for (let i = from; i <= to; i++) s += `${x[i]},${y[i]} `;
    return s;
  };
  const aFaster = miniSectors.filter((m) => m.gain > 0).length;
  const current = hover === null ? null : miniSectors.findIndex((m) => hover >= m.from && hover <= m.to);
  const sector = current === null || current < 0 ? null : miniSectors[current];

  function onPointer(e: PointerEvent<SVGSVGElement>) {
    const ctm = e.currentTarget.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < x.length; i++) {
      const d = (x[i] - p.x) ** 2 + (y[i] - p.y) ** 2;
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    }
    // Only near the track counts; anywhere else in the box clears the crosshair.
    onHover(Math.sqrt(bestD) < extent * 0.08 ? best : null);
  }

  return (
    <figure className="relative isolate space-y-3 lg:sticky lg:top-20 lg:self-start">
      <Watermark className="-rotate-6 text-2xl font-semibold tracking-[-0.03em] whitespace-nowrap text-foreground/[0.06]" />
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="eyebrow text-muted-foreground">Who&apos;s quicker where</span>
      </figcaption>
      <svg
        viewBox={view}
        role="img"
        aria-label={`Track map in ${miniSectors.length} mini-sectors: ${codes[0]} quicker in ${aFaster}, ${codes[1]} in ${miniSectors.length - aFaster}.`}
        className="block aspect-square w-full touch-pan-y"
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => onHover(null)}
      >
        <polyline points={points(0, x.length - 1)} fill="none" className="stroke-border" strokeWidth={12} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {miniSectors.map((m, i) => (
          <polyline
            key={i}
            points={points(m.from, m.to)}
            fill="none"
            className={cn(m.gain > 0 ? "stroke-driver-a" : "stroke-driver-b", sector && sector !== m && "opacity-40")}
            strokeWidth={6}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        ))}
        {/* Start/finish: a short bar across the track at the first point. */}
        <circle cx={x[0]} cy={y[0]} r={extent * 0.018} className="fill-background stroke-foreground" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {hover !== null && (
          <circle cx={x[hover]} cy={y[hover]} r={extent * 0.022} className="fill-foreground stroke-background" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        )}
      </svg>
      <div className="space-y-2 font-mono text-xs tabular text-muted-foreground">
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <SeriesKey which="a" />
            {codes[0]} quicker · <span className="font-semibold text-foreground">{aFaster}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <SeriesKey which="b" />
            {codes[1]} quicker · <span className="font-semibold text-foreground">{miniSectors.length - aFaster}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-2 rounded-full border-2 border-foreground" />
            Start
          </span>
        </p>
        <p aria-live="polite" className="min-h-4">
          {sector &&
            `Mini-sector ${current! + 1} of ${miniSectors.length}: ${sector.gain > 0 ? codes[0] : codes[1]} quicker by ${Math.abs(sector.gain).toFixed(3)} s`}
        </p>
      </div>
    </figure>
  );
}

function linePath(values: number[], x: (i: number) => number, y: (v: number) => number, step?: boolean): string {
  let d = "";
  for (let i = 0; i < values.length; i++) {
    const px = x(i).toFixed(1);
    const py = y(values[i]).toFixed(1);
    if (i === 0) d += `M${px},${py}`;
    else if (step) d += `H${px}V${py}`;
    else d += `L${px},${py}`;
  }
  return d;
}

function max(values: number[]): number {
  return values.reduce((m, v) => (v > m ? v : m), -Infinity);
}

/** Multiples of `step` inside the domain. */
function ticksIn([lo, hi]: [number, number], step: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}

/** [min, max] padded out to multiples of `step`, never below `floor`. */
function niceDomain(values: number[], step: number, floor: number): [number, number] {
  const lo = Math.max(floor, Math.floor(Math.min(...values) / step) * step);
  const hi = Math.ceil(max(values) / step) * step;
  return [lo, hi === lo ? lo + step : hi];
}
