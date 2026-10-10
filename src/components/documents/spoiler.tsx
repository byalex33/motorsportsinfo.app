"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { usePrefersReducedMotion } from "@/components/radar/use-client-state";
import { cn } from "@/lib/utils";

// Text hidden under shimmering grain that blows away from the click, after lab.xevrion.dev/lab/spoiler-text.

// The dissolve travels from the click to the far edge, then each grain fades once reached.
const SPREAD_MS = 450;
const GRAIN_FADE_MS = 300;
// Grains per square pixel: dense enough to hide letter shapes, sparse enough to read as shimmer.
const DENSITY = 0.15;
const MAX_GRAINS = 1200;

type Rect = { x: number; y: number; w: number; h: number };
type Grain = { x: number; y: number; a: number; phase: number; speed: number; size: number };
type Phase = "hidden" | "dissolving" | "revealed";

/**
 * Hides `children` until clicked. It sits inside a link, so the first click only reveals and is kept from
 * navigating; the text stays readable to screen readers, since a control can't nest inside a link.
 */
export function Spoiler({ children, className }: { children: string; className?: string }) {
  const reduceMotion = usePrefersReducedMotion();
  const [revealed, setRevealed] = useState(false);
  const [measured, setMeasured] = useState(false);
  const probeRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Everything the draw loop reads lives in one ref, so it never re-renders per frame.
  const engine = useRef({
    phase: "hidden" as Phase,
    phaseStart: 0,
    origin: { x: 0, y: 0 },
    maxDistance: 1,
    grains: [] as Grain[],
    rects: [] as Rect[],
    width: 0,
    height: 0,
    // The grain's own clock, which only advances while it shimmers.
    time: 0,
    last: 0,
    kick: () => {},
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const text = textRef.current;
    const probe = probeRef.current;
    if (!canvas || !text || !probe) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const e = engine.current;
    let frame = 0;
    let onScreen = true;
    let color = "";
    let colorAge = 0;
    const still = reduceMotion;
    const block = text.closest<HTMLElement>("p, div, li, h1, h2, h3") ?? text.parentElement;

    // An inline element that wraps has no single box, so lines are measured from its fragments and
    // placed relative to a zero-size probe.
    const measure = () => {
      const origin = probe.getBoundingClientRect();
      const fragments = Array.from(text.getClientRects()).filter((r) => r.width > 0);
      if (!fragments.length) return;
      const left = Math.min(...fragments.map((r) => r.left));
      const top = Math.min(...fragments.map((r) => r.top));
      e.width = Math.ceil(Math.max(...fragments.map((r) => r.right)) - left);
      e.height = Math.ceil(Math.max(...fragments.map((r) => r.bottom)) - top);
      e.rects = fragments.map((r) => ({ x: r.left - left, y: r.top - top, w: r.width, h: r.height }));

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(e.width * dpr);
      canvas.height = Math.round(e.height * dpr);
      canvas.style.width = `${e.width}px`;
      canvas.style.height = `${e.height}px`;
      canvas.style.left = `${Math.round(left - origin.left)}px`;
      canvas.style.top = `${Math.round(top - origin.top)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const area = e.rects.reduce((sum, r) => sum + r.w * r.h, 0);
      const perPx = Math.min(DENSITY, MAX_GRAINS / Math.max(area, 1));
      e.grains = e.rects.flatMap((r) =>
        Array.from({ length: Math.round(r.w * r.h * perPx) }, () => ({
          // Inset from the fragment's edge so the drift never leaves it.
          x: r.x + 1.5 + Math.random() * (r.w - 3),
          y: r.y + 2 + Math.random() * (r.h - 4),
          a: 0.35 + Math.random() * 0.65,
          phase: Math.random() * Math.PI * 2,
          speed: 0.6 + Math.random() * 1.8,
          size: Math.random() < 0.8 ? 1 : 1.5,
        })),
      );
      setMeasured(true);
      draw(performance.now());
    };

    const draw = (now: number) => {
      // The ink colour comes from the theme; re-read it now and then to pick up a theme switch.
      if (!color || colorAge++ > 30) {
        color = getComputedStyle(canvas).color;
        colorAge = 0;
      }
      ctx.clearRect(0, 0, e.width, e.height);
      if (e.phase === "revealed") return;
      ctx.fillStyle = color;
      const t = still ? 0 : e.time / 1000;
      const elapsed = now - e.phaseStart;

      for (const g of e.grains) {
        // Each grain drifts in a tiny loop and twinkles on its own clock.
        let x = g.x + Math.sin(t * g.speed + g.phase) * 1.2;
        let y = g.y + Math.cos(t * g.speed * 0.8 + g.phase) * 0.9;
        let alpha = g.a * (0.55 + 0.45 * Math.sin(t * g.speed * 2.2 + g.phase));
        if (e.phase === "dissolving") {
          const dx = g.x - e.origin.x;
          const dy = g.y - e.origin.y;
          const d = Math.hypot(dx, dy) || 1;
          const local = elapsed - (d / e.maxDistance) * SPREAD_MS;
          if (local > 0) {
            const p = Math.min(1, local / GRAIN_FADE_MS);
            // Blown outward from the click, fast at first, then drifting.
            const push = (1 - (1 - p) * (1 - p)) * 7;
            x += (dx / d) * push;
            y += (dy / d) * push * 0.6;
            alpha *= 1 - p;
          }
        }
        if (alpha <= 0.02) continue;
        ctx.globalAlpha = alpha;
        ctx.fillRect(x, y, g.size, g.size);
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      frame = 0;
      e.time += e.last ? Math.min(now - e.last, 50) : 0;
      e.last = now;
      if (e.phase === "dissolving" && now - e.phaseStart > SPREAD_MS + GRAIN_FADE_MS) {
        e.phase = "revealed";
        ctx.clearRect(0, 0, e.width, e.height);
        return;
      }
      draw(now);
      // Sleeps when revealed, offscreen or in a hidden tab.
      if (onScreen && !document.hidden) frame = requestAnimationFrame(loop);
      else e.last = 0;
    };

    e.kick = () => {
      if (still) {
        if (e.phase === "dissolving") e.phase = "revealed";
        draw(0);
        return;
      }
      if (!frame && e.phase !== "revealed") frame = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) e.kick();
    });
    io.observe(canvas);
    const onVisibility = () => {
      if (!document.hidden) e.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Re-measure whenever the block reflows, and once fonts settle.
    const ro = new ResizeObserver(() => measure());
    if (block) ro.observe(block);
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) measure();
    });
    measure();
    e.kick();

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      e.last = 0;
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      e.kick = () => {};
    };
  }, [reduceMotion]);

  const onClick = (event: MouseEvent) => {
    if (revealed) return;
    // Keep the first click from following the link around it.
    event.preventDefault();
    event.stopPropagation();
    setRevealed(true);
    const e = engine.current;
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return;
    e.origin = { x: event.clientX - box.left, y: event.clientY - box.top };
    e.maxDistance = Math.max(1, ...e.grains.map((g) => Math.hypot(g.x - e.origin.x, g.y - e.origin.y)));
    e.phase = "dissolving";
    e.phaseStart = performance.now();
    e.kick();
  };

  return (
    <span className={cn("relative", className)}>
      <span ref={probeRef} aria-hidden className="pointer-events-none absolute top-0 left-0 size-0" />
      <span
        ref={textRef}
        onClick={onClick}
        className={cn(
          // The padding is cancelled by an equal negative margin, so the pill never shifts the words.
          "-mx-0.5 rounded-[4px] box-decoration-clone px-0.5",
          "transition-[color,background-color,filter] ease-[cubic-bezier(0.23,1,0.32,1)]",
          revealed
            ? "bg-transparent text-inherit filter-none delay-75 duration-300"
            : "cursor-pointer bg-foreground/[0.06] text-transparent blur-[4px] duration-150 select-none motion-reduce:filter-none",
        )}
      >
        {children}
      </span>
      <canvas
        ref={canvasRef}
        aria-hidden
        // Before measuring it has no size; keep it from flashing at 300x150.
        className={cn("pointer-events-none absolute top-0 left-0 text-foreground", !measured && "invisible")}
      />
    </span>
  );
}

// Captured, so split() keeps the matches at the odd indexes.
const SPOILED = /(\bCar \d+\b)/i;

/** An FIA Document title in the list with every car number ("Car 27") behind a Spoiler. */
export function SpoilerTitle({ title }: { title: string }) {
  const parts = title.split(SPOILED);
  if (parts.length === 1) return title;
  return parts.map((part, i) => (i % 2 === 1 ? <Spoiler key={i}>{part}</Spoiler> : part));
}
