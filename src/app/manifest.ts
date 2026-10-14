import type { MetadataRoute } from "next";
import { SERIES } from "@/domain/series";
import { SERIES_IDS } from "@/domain/types";

const SHORTCUT_ICONS = [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }];

export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable identity, so a later change to start_url doesn't make browsers treat it as a new app.
    id: "/",
    name: "motorsportsinfo.app",
    short_name: "MSI",
    description: "Session times and weather for F1, F2, F3, WEC, Formula E, IndyCar, MotoGP, F1 Academy, WRC, IMSA, NASCAR, GT World Challenge Europe, DTM and Super GT, in your time zone.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // The page background, matching the layout's light theme-color: the installed app's title bar runs
    // straight into the white site header, as the browser's does. A manifest takes one colour only; in
    // dark mode browsers use the layout's dark theme-color (#0a0a0a) from the page instead.
    theme_color: "#ffffff",
    background_color: "#ffffff",
    categories: ["sports", "weather"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press (or right-click) on the installed icon. Android shows the first four.
    shortcuts: [
      ...SERIES_IDS.map((id) => ({
        name: SERIES[id].name,
        short_name: SERIES[id].shortName,
        description: `${SERIES[id].shortName} Session times and weather for the next Round`,
        url: `/${id}`,
        icons: SHORTCUT_ICONS,
      })),
      {
        name: "Alerts and calendar feed",
        short_name: "Alerts",
        description: "Session Reminders, Document Alerts and the calendar feed",
        url: "/alerts",
        icons: SHORTCUT_ICONS,
      },
    ],
  };
}
