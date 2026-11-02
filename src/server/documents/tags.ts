import type { FiaDocumentSeries } from "@/domain/types";

/**
 * Cache tag for a Series' fia.com listing and the documents the sync has recorded for it. The sync
 * revalidates it when it records new documents.
 */
export function fiaDocumentsTag(series: FiaDocumentSeries): string {
  return `fia-documents:${series}`;
}
