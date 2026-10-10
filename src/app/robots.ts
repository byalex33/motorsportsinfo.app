import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

// Everything public is crawlable except the API (cron jobs, push subscriptions). Calendar feeds stay
// crawlable so crawlers can read their X-Robots-Tag: noindex; FIA Document viewer pages are noindex.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
