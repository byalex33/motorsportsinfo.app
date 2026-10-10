"use client";
// Loaded only through next/dynamic from RadarPanel, so maplibre-gl and its CSS stay out of the first load.
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { Pause, Play } from "lucide-react";
import type { Circuit } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAP_HEIGHT, RadarCard } from "./radar-card";
import { RADAR_PAN_DEGREES } from "@/lib/radar-forecast";
import { fetchRadarFeed, type RadarFeed } from "./feed";
import { RADAR_TILE_SIZE, formatFrameAge, formatFrameClock } from "./rainviewer";
import { useIsDarkMode, usePrefersReducedMotion } from "./use-client-state";

// The bundler emits the worker as a static asset; maplibre's own lookup is relative to its module URL,
// which no longer exists once bundled.
const WORKER_URL = new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href;

const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";
const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";
const styleUrl = (dark: boolean) => (dark ? STYLE_DARK : STYLE_LIGHT);

const FRAME_MS = 500;
const LAST_FRAME_HOLD_MS = 1500;
const FRAMES_REFRESH_MS = 5 * 60_000;
const RADAR_OPACITY = 0.75;
const RADAR_LAYER_PREFIX = "radar-frame-";

/** Adds/removes one raster layer per frame (all preloaded) and shows only the active one. Idempotent. */
function syncRadarLayers(map: MapLibreMap, feed: RadarFeed | null, activeIndex: number) {
  if (!map.isStyleLoaded()) return;
  const frames = feed?.frames ?? [];
  const wanted = new Set(frames.map((f) => RADAR_LAYER_PREFIX + f.id));
  const layers = map.getStyle().layers;
  for (const layer of layers) {
    if (layer.id.startsWith(RADAR_LAYER_PREFIX) && !wanted.has(layer.id)) {
      map.removeLayer(layer.id);
      if (map.getSource(layer.id)) map.removeSource(layer.id);
    }
  }
  // Keep place names readable above the rain.
  const beforeId = layers.find((l) => l.type === "symbol")?.id;
  frames.forEach((frame, i) => {
    const id = RADAR_LAYER_PREFIX + frame.id;
    if (feed && !map.getSource(id)) {
      map.addSource(id, {
        type: "raster",
        tiles: [frame.tileUrl],
        tileSize: RADAR_TILE_SIZE,
        maxzoom: feed.maxZoom,
        attribution: feed.attribution,
      });
    }
    if (!map.getLayer(id)) {
      map.addLayer(
        {
          id,
          type: "raster",
          source: id,
          paint: {
            "raster-opacity": 0,
            "raster-opacity-transition": { duration: 0, delay: 0 },
            "raster-fade-duration": 0,
          },
        },
        beforeId,
      );
    }
    map.setPaintProperty(id, "raster-opacity", i === activeIndex ? RADAR_OPACITY : 0);
  });
}

export interface RadarMapProps {
  circuit: Circuit;
  /** Client clock (ms), for "x min ago". */
  nowMs: number;
}

export default function RadarMap({ circuit, nowMs }: RadarMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const styleRef = useRef<string | null>(null);
  const radarRef = useRef<{ feed: RadarFeed | null; index: number }>({ feed: null, index: 0 });
  const feedKeyRef = useRef("");

  const dark = useIsDarkMode();
  const reducedMotion = usePrefersReducedMotion();
  const [mapState, setMapState] = useState<"loading" | "ready" | "error">("loading");
  const [feed, setFeed] = useState<RadarFeed | null>(null);
  const [framesError, setFramesError] = useState(false);
  const [index, setIndex] = useState(0);
  // Rendered client-only (ssr: false), so this is the real preference on first render.
  const [playing, setPlaying] = useState(!reducedMotion);

  const { lat, lon, name } = circuit;
  const initialDark = useRef(dark);

  // Create the map once per Circuit.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    (async () => {
      const maplibre = await import("maplibre-gl");
      const container = containerRef.current;
      if (cancelled || !container) return;
      maplibre.setWorkerUrl(WORKER_URL);
      const style = styleUrl(initialDark.current);
      styleRef.current = style;
      map = new maplibre.Map({
        container,
        style,
        center: [lon, lat],
        zoom: 7,
        minZoom: 4,
        maxZoom: 10,
        // Keep panning near the Circuit: bounds the number of radar tiles we can request.
        maxBounds: [
          [lon - RADAR_PAN_DEGREES.lon, Math.max(lat - RADAR_PAN_DEGREES.lat, -85)],
          [lon + RADAR_PAN_DEGREES.lon, Math.min(lat + RADAR_PAN_DEGREES.lat, 85)],
        ],
        cooperativeGestures: true,
        dragRotate: false,
        touchPitch: false,
        pitchWithRotate: false,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

      const marker = document.createElement("div");
      marker.className = "size-4 rounded-full border-2 border-white ring-1 ring-black/30";
      marker.style.background = "var(--series-accent, var(--primary))";
      marker.setAttribute("role", "img");
      marker.setAttribute("aria-label", name);
      new maplibre.Marker({ element: marker }).setLngLat([lon, lat]).addTo(map);

      // Fires on first load and after every theme switch (setStyle drops our layers).
      map.on("style.load", () => {
        if (map) syncRadarLayers(map, radarRef.current.feed, radarRef.current.index);
      });
      map.once("load", () => {
        if (!cancelled) setMapState("ready");
      });
    })().catch((error) => {
      console.warn("[radar] map failed to load", error);
      if (!cancelled) setMapState("error");
    });
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [lat, lon, name]);

  // Follow the site theme.
  useEffect(() => {
    const map = mapRef.current;
    const style = styleUrl(dark);
    if (!map || styleRef.current === style) return;
    styleRef.current = style;
    map.setStyle(style);
  }, [dark, mapState]);

  // Frame list: now and every 5 minutes (1 request each; tiles of unchanged frames stay cached).
  // A new frame list restarts from "now": the first forecast frame, or the latest past one.
  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      fetchRadarFeed(controller.signal)
        .then((next) => {
          const key = next.frames.map((f) => f.id).join();
          if (key !== feedKeyRef.current) {
            feedKeyRef.current = key;
            setFeed(next);
            setIndex(next.kind === "forecast" ? 0 : Math.max(next.frames.length - 1, 0));
          }
          setFramesError(false);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          console.warn("[radar] radar frames failed to load", error);
          setFramesError(true);
        });
    void load();
    const id = window.setInterval(load, FRAMES_REFRESH_MS);
    return () => {
      controller.abort();
      window.clearInterval(id);
    };
  }, []);

  const frames = feed?.frames ?? [];
  const activeIndex = Math.min(index, Math.max(frames.length - 1, 0));

  // Push frames and the active frame to the map.
  useEffect(() => {
    radarRef.current = { feed, index: activeIndex };
    const map = mapRef.current;
    if (map && mapState === "ready") syncRadarLayers(map, feed, activeIndex);
  }, [feed, activeIndex, mapState]);

  // Animate: 500 ms per frame, hold on the last, loop.
  const isPlaying = playing && frames.length > 1;
  useEffect(() => {
    if (!isPlaying) return;
    const last = activeIndex === frames.length - 1;
    const id = window.setTimeout(() => setIndex((activeIndex + 1) % frames.length), last ? LAST_FRAME_HOLD_MS : FRAME_MS);
    return () => window.clearTimeout(id);
  }, [isPlaying, activeIndex, frames.length]);

  const frame = frames[activeIndex];
  const togglePlaying = () => {
    if (isPlaying) {
      setPlaying(false);
    } else {
      setPlaying(true);
      if (activeIndex === frames.length - 1) setIndex(0);
    }
  };

  const footer = (
    <div className="flex h-11 items-center gap-3 border-t border-border px-2.5">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={togglePlaying}
        disabled={frames.length < 2}
        aria-label={isPlaying ? "Pause radar animation" : "Play radar animation"}
      >
        {isPlaying ? <Pause key="pause" aria-hidden="true" className="enter-pop" /> : <Play key="play" aria-hidden="true" className="enter-pop" />}
      </Button>
      <p className="min-w-0 flex-1 truncate font-mono text-xs tabular-nums text-muted-foreground">
        {frame ? (
          <>
            <time dateTime={new Date(frame.time * 1000).toISOString()} className="font-medium text-foreground">
              {formatFrameClock(frame.time)}
            </time>{" "}
            · {formatFrameAge(frame.time, nowMs)}
          </>
        ) : framesError ? (
          "Radar images unavailable right now"
        ) : (
          "Loading radar…"
        )}
      </p>
      {frames.length > 1 && (
        <div className="hidden w-24 gap-0.5 sm:flex" aria-hidden="true">
          {frames.map((f, i) => (
            <span
              key={f.id}
              className={cn("h-0.5 flex-1 transition-colors duration-300 ease-out", i <= activeIndex ? "bg-series-accent" : "bg-border")}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <RadarCard circuitName={name} timeSpan={feed?.kind} footer={footer}>
      <div className={cn("relative", MAP_HEIGHT)}>
        <div
          ref={containerRef}
          // Not `absolute`: maplibre's CSS forces `position: relative` on the container.
          className="size-full"
          role="region"
          aria-label={`Rain radar map around ${name}`}
        />
        {/* Stays mounted so it can fade away once the map has drawn. */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-muted transition-opacity duration-500 ease-out",
            mapState === "loading" ? "animate-pulse" : "opacity-0",
          )}
          aria-hidden="true"
        />
        {mapState === "error" && (
          <div className="absolute inset-0 grid place-items-center bg-muted p-4 text-center text-sm text-muted-foreground">
            The map couldn’t load on this device.
          </div>
        )}
      </div>
    </RadarCard>
  );
}
