"use client";

import { useLayoutEffect, useRef } from "react";

const ACTIVE = ':scope > [aria-pressed="true"], :scope > [data-checked]';

/**
 * The sliding "selected" pill of a segmented control. Render it as the first child of a
 * `relative group/seg` container whose items are positioned (`relative`) and expose their state
 * with aria-pressed or data-checked. It follows the active item with a spring; until it has
 * measured (server render, hydration) the items keep their own active background, and once it is
 * ready it sets data-pill="ready" on the container so they can drop it
 * (`group-data-[pill=ready]/seg:bg-transparent!`). Purely visual: no focus, no events.
 */
export function SegmentPill() {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const pill = ref.current;
    const group = pill?.parentElement;
    if (!pill || !group) return;
    let shown = false;

    const place = () => {
      const active = group.querySelector<HTMLElement>(ACTIVE);
      if (!active) {
        pill.style.opacity = "0";
        shown = false;
        return;
      }
      const geometry = () => {
        pill.style.width = `${active.offsetWidth}px`;
        pill.style.height = `${active.offsetHeight}px`;
        pill.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
      };
      if (!shown) {
        // First appearance: jump into place, then fade in. No slide from nowhere.
        pill.style.transitionProperty = "opacity";
        geometry();
        void pill.offsetWidth;
        pill.style.transitionProperty = "";
        pill.style.opacity = "1";
        shown = true;
      } else {
        geometry();
      }
      group.dataset.pill = "ready";
    };

    place();
    const resizes = new ResizeObserver(place);
    const observeItems = () => {
      for (const child of group.children) resizes.observe(child);
    };
    // Items can be replaced, such as a deferred popup trigger swapped in for its stand-in (deferred-popup.ts):
    // follow the new one too.
    const mutations = new MutationObserver((records) => {
      if (records.some((record) => record.type === "childList" && record.target === group)) observeItems();
      place();
    });
    mutations.observe(group, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-pressed", "data-checked"] });
    observeItems();
    return () => {
      mutations.disconnect();
      resizes.disconnect();
      delete group.dataset.pill;
    };
  }, []);

  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 rounded-full bg-foreground opacity-0 transition-[transform,width,height,opacity] duration-500 ease-spring"
    />
  );
}
