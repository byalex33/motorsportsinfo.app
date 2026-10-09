import { cn } from "@/lib/utils";

/**
 * The site glyph: a stopwatch whose top-right quarter is chequered. Original artwork — no Series marks.
 * Keep in sync with the generated app icons (public/icons, src/app/icon.svg).
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={cn("size-6", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect x="26" y="4" width="12" height="6" rx="2" fill="currentColor" />
      <rect x="30" y="9" width="4" height="7" fill="currentColor" />
      <rect x="47" y="14" width="6" height="8" rx="2" transform="rotate(45 50 18)" fill="currentColor" />
      <circle cx="32" cy="37" r="22" stroke="currentColor" strokeWidth="5" />
      <g clipPath="url(#msi-mark-clip)" fill="currentColor">
        <rect x="32" y="20" width="4.25" height="4.25" />
        <rect x="40.5" y="20" width="4.25" height="4.25" />
        <rect x="36.25" y="24.25" width="4.25" height="4.25" />
        <rect x="44.75" y="24.25" width="4.25" height="4.25" />
        <rect x="32" y="28.5" width="4.25" height="4.25" />
        <rect x="40.5" y="28.5" width="4.25" height="4.25" />
        <rect x="36.25" y="32.75" width="4.25" height="4.25" />
        <rect x="44.75" y="32.75" width="4.25" height="4.25" />
      </g>
      <path d="M32 37 L22 27" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="37" r="3.5" fill="currentColor" />
      <defs>
        <clipPath id="msi-mark-clip">
          <path d="M32 37 V20 A17 17 0 0 1 49 37 Z" />
        </clipPath>
      </defs>
    </svg>
  );
}
