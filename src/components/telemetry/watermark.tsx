/**
 * A faint "motorsportsinfo.app" behind a chart, so a screenshot carries where it came from. Put it inside a
 * `relative isolate` box: it sits under the chart's marks and never takes pointer events.
 */
export function Watermark({ className }: { className?: string }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden select-none">
      <span className={className ?? "-rotate-6 text-4xl font-semibold tracking-[-0.03em] whitespace-nowrap text-foreground/[0.05] sm:text-6xl"}>
        motorsportsinfo.app
      </span>
    </span>
  );
}
