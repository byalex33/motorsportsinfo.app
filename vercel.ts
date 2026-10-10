import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    // Decides per Series whether a source check is due (daily / 2-hourly in a Round / 30 min before a Session),
    // and during an F1/F2/F3 Round records new FIA Documents for Document Alerts.
    { path: "/api/cron/sync", schedule: "*/5 * * * *" },
    // Sends due Session Reminders, unsent Schedule Change pushes and Document Alerts. Reads the database only.
    { path: "/api/cron/alerts", schedule: "* * * * *" },
  ],
};
