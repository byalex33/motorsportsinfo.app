import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

const ext = "underline decoration-border underline-offset-3 transition-colors hover:text-foreground hover:decoration-foreground/40";
const nav = "transition-colors hover:text-foreground";

/** Credits required by ADR 0001, the disclaimer, and site links. Shown on every page. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 font-mono text-xs leading-relaxed text-muted-foreground sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:gap-12">
        <div className="space-y-3">
          <p>
            <a className={ext} href="https://openf1.org" target="_blank" rel="noopener noreferrer">
              Data: OpenF1
            </a>
            {" · "}F2/F3/WEC data from official timetables{" · "}
            <a className={ext} href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
              Weather data by Open-Meteo.com
            </a>
            {" · "}
            <a className={ext} href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">
              Radar: RainViewer
            </a>
            {" · "}Map{" "}
            <a className={ext} href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">
              © OpenFreeMap
            </a>{" "}
            <a className={ext} href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">
              © OpenMapTiles
            </a>{" "}
            <a className={ext} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
              © OpenStreetMap contributors
            </a>
          </p>
          <p>
            Unofficial. Not affiliated with Formula 1, the FIA, the ACO or the WEC. F1, Formula 1 and related marks are
            trademarks of their respective owners.
          </p>
        </div>
        <nav aria-label="Site" className="flex items-start gap-5 uppercase tracking-[0.12em] md:flex-col md:items-end md:gap-2">
          <Link href="/about" className={nav}>
            About
          </Link>
          <Link href="/alerts" className={nav}>
            Alerts
          </Link>
          <span className="ml-auto flex items-center gap-1.5 normal-case tracking-normal md:mt-2 md:ml-0">
            <BrandMark className="size-3.5 text-primary" />
            motorsportsinfo.app
          </span>
        </nav>
      </div>
    </footer>
  );
}
