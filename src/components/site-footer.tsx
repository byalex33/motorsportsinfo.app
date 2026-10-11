import Link from "next/link";
import { cn } from "@/lib/utils";

export const CONTACT_EMAIL = "hello@motorsportsinfo.app";

/**
 * Where the Donate link points. ADR 0001: the site is non-commercial and funded by donations only.
 * There is no donation page yet, so this is null and the footer hides the link. Set it to the
 * donation page's URL (e.g. a Ko-fi or GitHub Sponsors page) and the link appears on every page.
 */
export const DONATE_URL: string | null = null;

const REPORT_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Wrong Session time")}`;

const link =
  "inline-flex min-h-6 items-center rounded-sm underline-offset-4 transition-colors duration-200 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * Slim site-wide footer: the ways to get in touch, and the "unofficial" line. Data credits stay on the
 * pages that show the data (Series pages, About), not here.
 */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t border-border", className)}>
      <div className="mx-auto grid w-full max-w-5xl gap-3 px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm text-muted-foreground sm:grid-cols-[1fr_auto] sm:items-center sm:gap-x-8 sm:px-6">
        <nav aria-label="Site">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <li>
              <Link href="/about" className={link}>
                About
              </Link>
            </li>
            <li>
              <Link href="/alerts" className={link}>
                Alerts
              </Link>
            </li>
            <li>
              <a href={REPORT_HREF} className={link}>
                Report a wrong time
              </a>
            </li>
            {DONATE_URL && (
              <li>
                <a href={DONATE_URL} className={cn(link, "text-foreground")} rel="noopener">
                  Donate
                </a>
              </li>
            )}
          </ul>
        </nav>
        <p className="sm:text-right">
          <a href={`mailto:${CONTACT_EMAIL}`} className={cn(link, "font-mono text-xs tracking-[0.02em]")}>
            {CONTACT_EMAIL}
          </a>
        </p>
        <p className="text-xs leading-relaxed text-pretty sm:col-span-2">
          Unofficial. Not affiliated with any Series, its organisers or the FIA.{" "}
          <Link href="/about#disclaimer" className={cn(link, "min-h-0 underline")}>
            Disclaimer
          </Link>
        </p>
      </div>
    </footer>
  );
}
