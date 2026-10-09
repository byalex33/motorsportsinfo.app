import { Fragment } from "react";
import { ENTER, enterDelay } from "@/lib/motion";

/**
 * A headline whose words rise and come into focus one after another. Server-safe (no hooks):
 * the animation is CSS, so it plays from the prerendered HTML. The words stay plain text
 * separated by spaces, so wrapping, copy and screen readers are unchanged.
 */
export function RevealWords({ text, delay = ENTER.title, window = ENTER.titleWindow }: { text: string; delay?: number; window?: number }) {
  const words = text.split(/\s+/).filter(Boolean);
  const step = words.length > 1 ? Math.min(40, window / (words.length - 1)) : 0;
  return words.map((word, i) => (
    <Fragment key={i}>
      {i > 0 && " "}
      <span className="enter-word" style={enterDelay(delay + i * step)}>
        {word}
      </span>
    </Fragment>
  ));
}
