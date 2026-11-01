"use client";

import { ArrowRightIcon, SparkleIcon, SparklesIcon, TrophyIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useNow } from "@/lib/client-stores";
import { useDismissedAnnouncement } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import type { Announcement } from "@/server/schedule";

/**
 * A strip under the header announcing a Special Event or a Celebration, linking onwards. It shows the one ending
 * soonest that has not ended, opens a moment after load (never during hydration, so it can't flash for a viewer
 * who closed it), stays closed on this device once dismissed, hides itself on a Special Event's own page and goes
 * away for everyone at its `until`. It takes the announcement's accent; a Celebration can make a name glow and throw confetti as it opens.
 */
export function AnnouncementBanner({ announcements }: { announcements: Announcement[] }) {
  const now = useNow(60_000);
  const dismissed = useDismissedAnnouncement();
  const pathname = usePathname();
  // The id being closed, not a flag: the banner stays mounted across navigations, so a later Special Event must
  // not inherit the previous one's exit animation (and be stored as dismissed when it ends).
  const [closingId, setClosingId] = useState<string | null>(null);

  const current = now === null ? undefined : announcements.find((a) => Date.parse(a.until) > now);
  if (!current || !dismissed.ready || dismissed.value === current.id) return null;
  if (current.kind === "special-event" && pathname === current.href) return null;
  const closing = closingId === current.id;
  const Icon = current.kind === "celebration" ? TrophyIcon : SparklesIcon;

  return (
    <div
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        if (closing) dismissed.set(current.id);
        else if (current.confetti.length > 0) void throwConfetti(current.id, current.confetti);
      }}
      className={cn(
        "grid grid-rows-[1fr]",
        closing ? "animate-[announce-out_220ms_var(--motion-in)_both]" : "animate-[announce-in_520ms_var(--motion-out)_600ms_both]",
      )}
    >
      <aside
        aria-label="Announcement"
        data-accent={current.accent ?? undefined}
        className="min-h-0 overflow-hidden border-b border-series-accent/20 bg-series-accent/[0.07]"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-2 py-1.5 pr-2.5 pl-4 sm:pr-4 sm:pl-6">
          <Link
            href={current.href}
            prefetch
            className="group/announce -my-1 flex min-h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="chip shrink-0 bg-series-accent text-series-accent-foreground">
              <Icon className="size-3" aria-hidden />
              {current.chip}
            </span>
            <span className="min-w-0 leading-snug text-pretty">
              <span className="font-medium">
                <AnnouncementText text={current.text} highlight={current.highlight} />.
              </span>{" "}
              <span className="whitespace-nowrap text-series-accent underline-offset-4 group-hover/announce:underline">
                {current.linkLabel}
                <ArrowRightIcon className="ml-1 inline size-3.5 align-[-0.15em] transition-transform group-hover/announce:translate-x-0.5" aria-hidden />
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setClosingId(current.id)}
            aria-label="Dismiss announcement"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-series-accent/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon className="size-3.5" aria-hidden />
          </button>
        </div>
      </aside>
    </div>
  );
}

/**
 * Three waves of confetti shot down and inwards from the top-left and top-right corners, once per visit (per tab)
 * for each announcement. canvas-confetti is loaded only here, and draws nothing for a viewer who prefers reduced
 * motion.
 */
async function throwConfetti(id: string, colors: string[]) {
  const key = `msi.confetti.${id}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // Without storage it may throw again on the next full load; that is all.
  }
  const { default: confetti } = await import("canvas-confetti");
  const shared = { colors, particleCount: 70, spread: 55, startVelocity: 55, ticks: 320, disableForReducedMotion: true };
  const wave = () => {
    void confetti({ ...shared, angle: 310, origin: { x: 0, y: 0 } });
    void confetti({ ...shared, angle: 230, origin: { x: 1, y: 0 } });
  };
  wave();
  window.setTimeout(wave, 350);
  window.setTimeout(wave, 700);
}

// Where each sparkle sits around the highlighted name, its size, colour and when it first twinkles.
const SPARKLES = [
  { left: "-0.55em", top: "-0.3em", size: "0.75em", tone: "sheen", delay: "0s" },
  { left: "26%", top: "-0.5em", size: "0.5em", tone: "accent", delay: "0.9s" },
  { left: "58%", top: "0.8em", size: "0.55em", tone: "sheen", delay: "1.7s" },
  { left: "calc(100% - 0.1em)", top: "-0.35em", size: "0.8em", tone: "accent", delay: "0.45s" },
  { left: "86%", top: "0.85em", size: "0.45em", tone: "sheen", delay: "2.2s" },
] as const;

/** A Celebration's name: a sheen sweeps through it, it glows in the accent and sparkles twinkle round it. */
function GlowName({ children }: { children: string }) {
  return (
    <span className="glow-name">
      <span className="glow-name-text">{children}</span>
      {SPARKLES.map((s, i) => (
        <SparkleIcon
          key={i}
          aria-hidden
          className="glow-sparkle"
          fill="currentColor"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animationDelay: s.delay,
            color: s.tone === "sheen" ? "var(--glow-sheen)" : "var(--accent-glow, var(--series-accent))",
          }}
        />
      ))}
    </span>
  );
}

/** The announcement's line, with its highlight (if any) glowing. */
function AnnouncementText({ text, highlight }: { text: string; highlight: string | null }) {
  const at = highlight ? text.indexOf(highlight) : -1;
  if (!highlight || at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <GlowName>{highlight}</GlowName>
      {text.slice(at + highlight.length)}
    </>
  );
}
