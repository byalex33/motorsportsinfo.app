import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    // Decides per Series whether a source check is due (daily / 2-hourly in a Round / 30 min before a Session).
    { path: "/api/cron/sync", schedule: "*/5 * * * *" },
    // Sends due Session Reminders and unsent Schedule Change pushes. Reads the database only.
    { path: "/api/cron/alerts", schedule: "* * * * *" },
  ],
};
