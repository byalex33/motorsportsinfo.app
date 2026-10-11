// Site-wide identity used by metadata, the sitemap, robots.txt, Open Graph images and JSON-LD.
// The canonical origin lives here only; everything else builds absolute URLs from it.

export const SITE_URL = "https://motorsportsinfo.app";
export const SITE_NAME = "motorsportsinfo.app";
export const SITE_LOCALE = "en_GB";
export const SITE_DESCRIPTION =
  "Session times and weather for F1, F2, F3, WEC, Formula E, IndyCar and MotoGP — in your time zone or Track Time, with live countdowns and rain radar.";
/** The square app icon, used as the Organization logo. */
export const SITE_LOGO_PATH = "/icons/icon-512.png";
/** The public source repository. */
export const REPO_URL = "https://github.com/byalex33/motorsportsinfo.app";

/** Absolute URL on the canonical origin for a site path ("/f1" → "https://motorsportsinfo.app/f1"). */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}
