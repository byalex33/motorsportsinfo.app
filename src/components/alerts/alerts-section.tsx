import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A flat Alerts section: hairline rule, mono index and micro-label heading, then a short description. */
export function AlertsSection({
  id,
  index,
  title,
  description,
  className,
  children,
}: {
  id: string;
  index: string;
  title: string;
  description: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn("min-w-0 border-t border-border pt-4", className)}>
      <h2 id={id} className="eyebrow flex items-center gap-3 text-foreground">
        <span aria-hidden className="text-muted-foreground tabular">
          {index}
        </span>
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty text-muted-foreground">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}
