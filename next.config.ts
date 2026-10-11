import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Hosts the browser talks to directly. Everything else (Open-Meteo, OpenF1, fia.com, Rainbow.ai) is
// fetched on the server; the PDF.js and MapLibre workers are bundled and served from this origin.
const TRACWELL = "https://collect.tracwell.app"; // analytics events (fetch and sendBeacon)
const OPENFREEMAP = "https://tiles.openfreemap.org"; // radar base map: styles, vector tiles, fonts, sprites
const RAINVIEWER_API = "https://api.rainviewer.com"; // past radar frame list, when the forecast is unavailable
const RAINVIEWER_TILES = "https://tilecache.rainviewer.com"; // past radar frames

// Report-only for now: violations are logged in the browser console and nothing is blocked. Enforce it
// (rename the header to Content-Security-Policy) once a week of real use shows no unexpected reports.
// 'unsafe-inline' scripts: Next's inline RSC payload and next-themes' no-flash script; no nonces, so
// pages stay static. 'unsafe-eval' only in development, where React needs it.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${OPENFREEMAP} ${RAINVIEWER_TILES}`,
  "font-src 'self' data:",
  `connect-src 'self' ${TRACWELL} ${OPENFREEMAP} ${RAINVIEWER_API} ${RAINVIEWER_TILES}`,
  // MapLibre may start its workers from blob: URLs; the service worker and PDF.js worker are same-origin.
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        // Not on the FIA Document PDFs (/documents/*.pdf): they open in the browser's own PDF viewer,
        // which a page policy such as object-src 'none' can stop once the policy is enforced.
        source: "/((?!documents/).*)",
        headers: [{ key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy }],
      },
    ];
  },
};

export default nextConfig;
