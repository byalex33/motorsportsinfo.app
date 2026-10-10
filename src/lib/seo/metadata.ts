import type { Metadata } from "next";
import { SITE_LOCALE, SITE_NAME } from "@/lib/site";

/**
 * Next.js merges metadata shallowly: a page's `openGraph` or `twitter` object replaces the layout's
 * whole object. Pages build theirs here so og:type, og:site_name, og:locale and the large X card
 * are never lost. Images come from the opengraph-image / twitter-image files.
 */
export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
  ...rest
}: {
  title: string;
  description: string;
  /** Canonical path, e.g. "/f1". */
  path: string;
  /** Use the title as-is instead of the "%s · motorsportsinfo.app" template. */
  absoluteTitle?: boolean;
} & Omit<Metadata, "title" | "description" | "openGraph" | "twitter">): Metadata {
  return {
    ...rest,
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { ...rest.alternates, canonical: path },
    openGraph: { type: "website", siteName: SITE_NAME, locale: SITE_LOCALE, title, description, url: path },
    twitter: { card: "summary_large_image", title, description },
  };
}
