"use client";

import { useEffect, useRef, useState } from "react";
import { FileWarningIcon } from "lucide-react";
import type { PDFDocumentProxy, RenderTask, TextLayer } from "pdfjs-dist";
import { cn } from "@/lib/utils";

type Pdfjs = typeof import("pdfjs-dist");

/** Pages this far outside the viewport are rendered ahead of time, so scrolling never shows a blank page. */
const RENDER_MARGIN = "1200px 0px";
/** Device pixels per CSS pixel are capped here: sharp on phones, without huge canvases. */
const MAX_PIXEL_RATIO = 2;

let pdfjsPromise: Promise<Pdfjs> | null = null;

/** PDF.js and its worker load on first use only, and once per page lifetime. */
function loadPdfjs(): Promise<Pdfjs> {
  pdfjsPromise ??= import("pdfjs-dist")
    .then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("./pdf.worker.ts", import.meta.url), { type: "module" });
      return pdfjs;
    })
    .catch((error) => {
      pdfjsPromise = null;
      throw error;
    });
  return pdfjsPromise;
}

interface PageSize {
  width: number;
  height: number;
}

type Loaded =
  | { kind: "ready"; pdfjs: Pdfjs; pdf: PDFDocumentProxy; pages: PageSize[] }
  | { kind: "error" };

/**
 * Renders a PDF in the page with PDF.js: every page at the width of the column, with a text layer on
 * top so the text can be selected, copied and found with the browser's find. `fallbackHref` is offered
 * when the PDF cannot be shown.
 */
export function PdfViewer({ src, fallbackHref }: { src: string; fallbackHref: string }) {
  // Tagged with its src, so a result for a previous src reads as still loading.
  const [loaded, setLoaded] = useState<(Loaded & { src: string }) | null>(null);
  const state: Loaded | { kind: "loading" } = loaded?.src === src ? loaded : { kind: "loading" };
  const columnRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => Promise<void>) | null = null;

    loadPdfjs()
      .then(async (pdfjs) => {
        const task = pdfjs.getDocument({ url: src });
        destroy = () => task.destroy();
        const pdf = await task.promise;
        const pages: PageSize[] = [];
        for (let n = 1; n <= pdf.numPages; n++) {
          const { width, height } = (await pdf.getPage(n)).getViewport({ scale: 1 });
          pages.push({ width, height });
        }
        if (!cancelled) setLoaded({ kind: "ready", pdfjs, pdf, pages, src });
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("[documents] PDF could not be shown:", error);
        setLoaded({ kind: "error", src });
      });

    return () => {
      cancelled = true;
      void destroy?.();
    };
  }, [src]);

  useEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(column);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={columnRef} className="w-full">
      {state.kind === "error" ? (
        <div className="flex flex-col items-center gap-4 border-y border-border px-4 py-12 text-center text-sm text-muted-foreground">
          <FileWarningIcon className="size-5" aria-hidden />
          <p className="max-w-sm text-pretty">This document could not be shown here.</p>
          <a
            href={fallbackHref}
            className="rounded-full bg-foreground px-4 py-1.5 text-[0.8125rem] font-medium text-background transition-opacity hover:opacity-90"
          >
            Download it from fia.com
          </a>
        </div>
      ) : state.kind === "loading" ? (
        <div aria-busy="true" aria-label="Loading document" className="space-y-4">
          <div className="aspect-[1/1.414] w-full animate-pulse rounded-sm bg-muted" />
        </div>
      ) : (
        <ol className="space-y-5" aria-label={`${state.pages.length} page${state.pages.length === 1 ? "" : "s"}`}>
          {state.pages.map((size, index) => (
            <li key={index} className="space-y-2">
              <PdfPage pdfjs={state.pdfjs} pdf={state.pdf} index={index} size={size} width={width} />
              {state.pages.length > 1 && (
                <p className="text-center font-mono text-[0.6875rem] text-muted-foreground tabular">
                  {index + 1} / {state.pages.length}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PdfPage({
  pdfjs,
  pdf,
  index,
  size,
  width,
}: {
  pdfjs: Pdfjs;
  pdf: PDFDocumentProxy;
  index: number;
  size: PageSize;
  width: number;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(index === 0);
  const [rendered, setRendered] = useState(false);

  // Render a page once it comes near the viewport; it stays rendered after that.
  useEffect(() => {
    const el = pageRef.current;
    if (!el || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: RENDER_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);

  // (Re-)render at the column width: on first sight and whenever the width changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const text = textRef.current;
    if (!near || width <= 0 || !canvas || !text) return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let textLayer: TextLayer | null = null;

    (async () => {
      const page = await pdf.getPage(index + 1);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: width / size.width });
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      // Render off-screen, then swap in, so a resize never flashes a blank page.
      const next = document.createElement("canvas");
      next.width = Math.floor(viewport.width * ratio);
      next.height = Math.floor(viewport.height * ratio);
      renderTask = page.render({ canvas: next, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      await renderTask.promise;
      if (cancelled) return;
      canvas.width = next.width;
      canvas.height = next.height;
      canvas.getContext("2d")?.drawImage(next, 0, 0);
      setRendered(true);

      text.replaceChildren();
      text.style.setProperty("--total-scale-factor", String(viewport.scale));
      textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport });
      await textLayer.render();
    })().catch((error) => {
      if (cancelled || error instanceof pdfjs.RenderingCancelledException) return;
      console.warn(`[documents] page ${index + 1} could not be rendered:`, error);
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [near, width, pdf, pdfjs, index, size.width]);

  return (
    <div
      ref={pageRef}
      className="relative w-full overflow-hidden rounded-sm bg-white shadow-sm ring-1 ring-foreground/10"
      style={{ aspectRatio: `${size.width} / ${size.height}` }}
    >
      {!rendered && <div aria-hidden className="absolute inset-0 animate-pulse bg-muted/40" />}
      <canvas ref={canvasRef} aria-hidden className={cn("absolute inset-0 size-full", !rendered && "opacity-0")} />
      <div ref={textRef} className="pdf-text-layer" />
    </div>
  );
}
