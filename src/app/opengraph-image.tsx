import { BRAND_OG_ALT, brandOgImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/seo/og-image";

// The site's card, used by the home, About and Alerts pages (Series pages have their own).
export const alt = BRAND_OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return brandOgImage();
}
