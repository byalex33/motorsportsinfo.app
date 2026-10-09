// FIA documents for F1, F2 and F3, read from the championship pages on fia.com/documents.
// Each page lists the championship's events, newest first and across several seasons, but only
// renders the documents of the event at the top (the "active" one, with the latest documents).
// The others load by AJAX, so a Round's documents are readable here while it is the FIA's latest.
// A row is <li class="document-row"><a href="/system/files/decision-document/….pdf"> with a
// .title ("Doc 33 - Provisional Sprint Starting Grid") and a .published date ("09.10.26 18:00 CET").
// The "CET" label is fixed: the time is Paris wall-clock time, so it is CEST in summer.
import * as cheerio from "cheerio";
import { matchCircuit } from "@/data/circuits";
import type { Circuit, FiaDocument, FiaDocumentKind, FiaDocumentSeries, Round } from "@/domain/types";
import { addDays, zoneOffsetMinutes } from "@/server/schedule/time";
import { getPage, type SourceContext } from "@/server/schedule/sources/http";
import { fiaDocumentFile } from "./viewer";

export const FIA_SITE = "https://www.fia.com";

export const FIA_DOCUMENT_PAGES: Record<FiaDocumentSeries, string> = {
  f1: `${FIA_SITE}/documents/championships/fia-formula-one-world-championship-14`,
  f2: `${FIA_SITE}/documents/championships/formula-2-championship-44`,
  f3: `${FIA_SITE}/documents/championships/fia-formula-3-championship-1012`,
};

const PUBLISHED_TIME_ZONE = "Europe/Paris";

/** A document is matched to a Round only if it was published this close to the Round's dates. */
const MATCH_WINDOW_DAYS = 14;

export interface FiaEventDocuments {
  /** e.g. "Singapore Grand Prix" (F1) or "Baku" (F2, F3). */
  event: string;
  /** Newest first. */
  documents: FiaDocument[];
}

/** "09.10.26 18:00" (Paris wall-clock time) → ISO UTC, or null. */
export function fiaPublishedToIso(text: string): string | null {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s+(\d{1,2}):(\d{2})/.exec(text);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const guess = Date.UTC(year, Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
  if (Number.isNaN(guess)) return null;
  let utc = guess - zoneOffsetMinutes(PUBLISHED_TIME_ZONE, new Date(guess)) * 60000;
  // Re-check once in case a DST transition lies between the guess and the result.
  utc = guess - zoneOffsetMinutes(PUBLISHED_TIME_ZONE, new Date(utc)) * 60000;
  return new Date(utc).toISOString();
}

const STEWARDS = /\b(decision|infringement|summons|offen[cs]e|penalt(y|ies)|reprimand|right of review|protest|appeal|stewards)\b/i;
const RESULTS = /\b(classification|grid|championship|standings|lap chart|results?)\b/i;

/** Stewards first, so "Decision - … Classification" is a stewards' document. */
export function fiaDocumentKind(title: string): FiaDocumentKind {
  if (STEWARDS.test(title)) return "stewards";
  if (RESULTS.test(title)) return "results";
  return "other";
}

/** "Doc 33 - Provisional Sprint Starting Grid" → { number: 33, title: "Provisional Sprint Starting Grid" }. */
export function splitDocumentTitle(raw: string): { number: number | null; title: string } {
  const text = raw.replace(/\s+/g, " ").trim();
  const m = /^doc(?:ument)?\.?\s*(\d+)\s*[-–—:]\s*(.+)$/i.exec(text);
  return m ? { number: Number(m[1]), title: m[2].trim() } : { number: null, title: text };
}

/** The active event and its documents, or null when the page lists no event (layout changed). */
export function parseFiaDocumentsPage(html: string): FiaEventDocuments | null {
  const $ = cheerio.load(html);
  const list = $(".decision-document-list").first();
  if (!list.length) return null;

  const active = list.find(".event-title.active").first();
  const wrapper = active.length ? active.closest(".event-wrapper") : list.find(".event-wrapper").first();
  const event = (active.length ? active : wrapper.find(".event-title").first()).text().replace(/\s+/g, " ").trim();
  if (!event) return null;

  const documents: FiaDocument[] = [];
  const seen = new Set<string>();
  wrapper.find(".document-row a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const rawTitle = $(a).find(".title").text();
    if (!href || !rawTitle.trim()) return;
    const url = new URL(href, FIA_SITE).toString();
    if (seen.has(url)) return;
    seen.add(url);
    const { number, title } = splitDocumentTitle(rawTitle);
    const published = $(a).find(".published .date-display-single").first().text() || $(a).find(".published").text();
    documents.push({
      number,
      title,
      kind: fiaDocumentKind(title),
      url,
      file: fiaDocumentFile(url),
      publishedAt: fiaPublishedToIso(published),
    });
  });

  // The page lists newest first; sort anyway, by time then number, so a re-upload lands in place.
  documents.sort(
    (a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || (b.number ?? 0) - (a.number ?? 0),
  );
  return { event, documents };
}

function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Whether an FIA event is this Round. F1 events carry the Round's name ("Singapore Grand Prix",
 * or "Bahrain Grand Prix" for the 2026 Round relocated to Sepang); F2 and F3 events are named after
 * the place ("Baku", "Spa-Francorchamps", "Monte-Carlo"), which the Circuit aliases cover. The
 * documents must also fall near the Round's dates, as the same event name comes back every season.
 */
export function eventMatchesRound(listing: FiaEventDocuments, round: Round, circuit: Circuit): boolean {
  const title = normalise(listing.event);
  if (!title) return false;
  const named = title === normalise(round.name) || matchCircuit([listing.event])?.id === circuit.id;
  if (!named) return false;

  const from = addDays(round.startDate, -MATCH_WINDOW_DAYS);
  const to = addDays(round.endDate, MATCH_WINDOW_DAYS);
  // With no readable dates there is nothing to tell this season's event from last season's.
  return listing.documents.some((d) => {
    const day = d.publishedAt?.slice(0, 10);
    return !!day && day >= from && day <= to;
  });
}

/** Fetches a championship's page and returns its active event. Throws on HTTP or layout failure. */
export async function fetchFiaDocuments(ctx: SourceContext, series: FiaDocumentSeries): Promise<FiaEventDocuments> {
  const url = FIA_DOCUMENT_PAGES[series];
  const listing = parseFiaDocumentsPage(await getPage(ctx, url));
  if (!listing) throw new Error(`No document list on ${url}`);
  return listing;
}
