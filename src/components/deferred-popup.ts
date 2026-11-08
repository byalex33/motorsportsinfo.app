"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Popovers and dialogs (Base UI and its floating-ui positioning, ~55 KB gzipped) load after the page is
// interactive instead of before it. Until then a plain button with the same look stands in for each
// trigger. The popup's module loads when the browser is idle, or as soon as the pointer or focus reaches
// the stand-in; a click before it arrives opens the popup when it does, and focus moves to the real trigger.

/** What a loaded popup takes so it picks up where its stand-in left off. */
export interface DeferredPopupProps {
  /** The stand-in was clicked before the popup loaded: open straight away. */
  defaultOpen?: boolean;
  /** The stand-in had focus when it was swapped out: focus the real trigger (pass `focusOnMount` as its ref). */
  focusTrigger?: boolean;
}

export interface DeferredLoader<M> {
  (): Promise<M>;
  /** The module, once loaded. */
  loaded: M | null;
}

/** One shared import of a popup module, started at most once. A failed load (offline) is tried again next time. */
export function deferredLoader<M>(load: () => Promise<M>): DeferredLoader<M> {
  let pending: Promise<M> | null = null;
  const loader: DeferredLoader<M> = Object.assign(
    () =>
      (pending ??= load().then(
        (module) => (loader.loaded = module),
        (error: unknown) => {
          pending = null;
          throw error;
        },
      )),
    { loaded: null },
  );
  return loader;
}

/** A stable ref callback that focuses the element it is attached to. */
export function focusOnMount(element: HTMLElement | null): void {
  element?.focus({ preventScroll: true });
}

function whenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(run, { timeout: 3000 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(run, 1500);
  return () => window.clearTimeout(handle);
}

/**
 * Loads the module when the browser is idle, or sooner through `request` (hover, focus, click). Null until
 * it arrives, including during hydration, so the server markup matches. `onLoad` runs as it arrives, before
 * the render that uses it.
 */
function useLoaded<M, T>(loader: DeferredLoader<M>, onLoad: (module: M) => T) {
  const [loaded, setLoaded] = useState<T | null>(null);
  const onLoadRef = useRef(onLoad);
  useEffect(() => {
    onLoadRef.current = onLoad;
  });

  const request = useCallback(() => {
    loader().then(
      (module) => {
        const value = onLoadRef.current(module);
        setLoaded((current) => current ?? value);
      },
      () => {
        // Offline or a failed chunk: keep waiting, and the next hover, focus or click tries again.
      },
    );
  }, [loader]);

  useEffect(() => {
    if (loaded !== null) return;
    if (loader.loaded) {
      request();
      return;
    }
    return whenIdle(request);
  }, [loaded, loader, request]);

  return [loaded, request] as const;
}

/** A popup module whose trigger stays the caller's own element: the module (null until loaded) and `request`. */
export function useDeferredModule<M>(loader: DeferredLoader<M>) {
  return useLoaded(loader, (module) => module);
}

/**
 * A popup whose trigger is part of the popup's module: the module (null until it arrives), the props to mount
 * it with, and the props for the stand-in trigger button that renders until then.
 */
export function useDeferredPopup<M>(loader: DeferredLoader<M>) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wantsOpen = useRef(false);
  const [loaded, request] = useLoaded(loader, (module) => ({
    module,
    mount: { defaultOpen: wantsOpen.current, focusTrigger: triggerRef.current !== null && triggerRef.current === document.activeElement },
  }));

  const triggerProps = {
    ref: triggerRef,
    type: "button" as const,
    "aria-haspopup": "dialog" as const,
    "aria-expanded": false,
    onPointerEnter: request,
    onFocus: request,
    onClick: () => {
      wantsOpen.current = true;
      request();
    },
  };

  return { popup: loaded?.module ?? null, mount: loaded?.mount ?? {}, triggerProps };
}
