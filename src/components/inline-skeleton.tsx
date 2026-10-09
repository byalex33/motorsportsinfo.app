import { cn } from "@/lib/utils";

/** A <span> skeleton, safe inside text elements such as <p> and <span>. */
export function InlineSkeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block animate-pulse rounded-md bg-muted align-middle", className)} />;
}
