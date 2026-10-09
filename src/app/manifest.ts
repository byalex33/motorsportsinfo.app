import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "motorsportsinfo.app",
    short_name: "MSI",
    description: "Session times and weather for F1, F2, F3, WEC, Formula E, IndyCar and MotoGP, in your time zone.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Deep Purple primary (light) and the neutral light background.
    theme_color: "#6b26d9",
    background_color: "#ffffff",
    categories: ["sports", "weather"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
