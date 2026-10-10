import { serializeJsonLd, type JsonLdObject } from "@/lib/seo/json-ld";

/** Structured data in the server HTML. A plain <script> (not next/script): it is data, not code. */
export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
