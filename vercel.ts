import type { VercelConfig } from "@vercel/config/v1";

// Only `config` is exported: Vercel reads this file's exports as configuration.

/** The Series ids, as in src/domain/types.ts (src/vercel-config.test.ts keeps the two in step). */
const SERIES_URL_IDS = ["f1", "f2", "f3", "wec", "fe", "indycar", "motogp", "f1-academy", "wrc", "imsa", "nascar"] as const;

/**
 * A permanent redirect from any upper- or mixed-case spelling of a Series page (/F1, /WEC, /MotoGP,
 * /IndyCar/) to its lowercase URL, which is the only one the app serves.
 *
 * Vercel route matching ignores case unless `caseSensitive` is set, so a plain "/F1" rule would also
 * match "/f1" and redirect it to itself forever. This rule is case-sensitive, and the lookahead
 * excludes the lowercase spelling as well: if case were ever ignored, the lookahead would reject every
 * spelling and the rule would match nothing, rather than loop.
 */
function seriesCaseRedirect(id: string) {
  const anyCase = [...id].map((c) => (/[a-z]/.test(c) ? `[${c}${c.toUpperCase()}]` : c)).join("");
  return {
    src: `^/(?!${id}/?$)${anyCase}/?$`,
    caseSensitive: true,
    status: 308,
    headers: { Location: `/${id}` },
  };
}

export const config: VercelConfig = {
  framework: "nextjs",
  routes: SERIES_URL_IDS.map(seriesCaseRedirect),
  crons: [
    // Decides per Series whether a source check is due (daily / 2-hourly in a Round / 30 min before a Session),
    // and during an F1/F2/F3 Round records new FIA Documents for Document Alerts.
    { path: "/api/cron/sync", schedule: "*/5 * * * *" },
    // Sends due Session Reminders, unsent Schedule Change pushes and Document Alerts. Reads the database only.
    { path: "/api/cron/alerts", schedule: "* * * * *" },
  ],
};
