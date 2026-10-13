import { BRAND_OG_ALT, brandOgImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/seo/og-image";
import { listSpecialEvents } from "@/server/schedule";

// The site card. A page that sets its own openGraph metadata does not inherit the root image, so it gets its own copy.
export const alt = BRAND_OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export async function generateStaticParams() {
  return listSpecialEvents().map((event) => ({ slug: event.slug }));
}

export default function Image() {
  return brandOgImage();
}
