import type { RoundDocumentsResult } from "@/domain/types";

/**
 * A Series page's sitemap lastmod: the newest real content change we know of — the Featured Round's
 * published schedule (Round or Sessions) or its newest FIA Document — else `fallback` (the deploy
 * time). Never the render time: a lastmod that moves on every re-render teaches crawlers to ignore it.
 */
export function seriesLastModified({
  scheduleUpdatedAt,
  documents,
  fallback,
}: {
  scheduleUpdatedAt: string | null;
  documents: RoundDocumentsResult | null;
  fallback: Date;
}): Date {
  const times: number[] = [];
  if (scheduleUpdatedAt) times.push(Date.parse(scheduleUpdatedAt));
  if (documents?.kind === "documents") {
    for (const d of documents.documents) if (d.publishedAt) times.push(Date.parse(d.publishedAt));
  }
  const valid = times.filter((t) => Number.isFinite(t));
  return valid.length > 0 ? new Date(Math.max(...valid)) : fallback;
}
