import Link from "next/link";

export interface BreadcrumbItem {
  name: string;
  /** Omitted on the current page. */
  href?: string;
}

/** Home › F1 › United States Grand Prix. Crawlable, and the visible form of the BreadcrumbList JSON-LD. */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${item.name}-${index}`} className="flex min-w-0 items-center gap-2">
              {index > 0 && (
                <span aria-hidden className="text-border">
                  /
                </span>
              )}
              {item.href && !current ? (
                <Link
                  href={item.href}
                  className="underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.name}
                </Link>
              ) : (
                <span className="truncate text-foreground" aria-current={current ? "page" : undefined}>
                  {item.name}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
