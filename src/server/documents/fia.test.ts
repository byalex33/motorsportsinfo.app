import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getCircuit } from "@/data/circuits";
import { makeRound } from "@/server/schedule/test-utils";
import {
  eventMatchesRound,
  fetchFiaDocuments,
  fiaDocumentKind,
  fiaPublishedToIso,
  parseFiaDocumentsPage,
  splitDocumentTitle,
  type FiaEventDocuments,
} from "./fia";

// Trimmed real pages from fia.com/documents: the document list only, F2 cut to its first and last rows.
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8");

const f1Html = fixture("fia-f1-singapore-2026.html");
const f2Html = fixture("fia-f2-baku-2026.html");

describe("parseFiaDocumentsPage", () => {
  const f1 = parseFiaDocumentsPage(f1Html)!;

  it("reads only the active event, not the collapsed ones below it", () => {
    expect(f1.event).toBe("Singapore Grand Prix");
    // Doc 1 to Doc 33; the FIA withdrew Doc 15.
    expect(f1.documents).toHaveLength(32);
    expect(f1.documents.some((d) => d.number === 15)).toBe(false);
  });

  it("splits the number from the title and links the PDF on fia.com", () => {
    expect(f1.documents[0]).toEqual({
      number: 33,
      title: "Provisional Sprint Starting Grid",
      kind: "results",
      url: "https://www.fia.com/system/files/decision-document/2026_singapore_grand_prix_-_provisional_sprint_starting_grid.pdf",
      file: "2026_singapore_grand_prix_-_provisional_sprint_starting_grid.pdf",
      publishedAt: "2026-10-09T16:00:00.000Z",
    });
  });

  it("orders newest first", () => {
    const times = f1.documents.map((d) => d.publishedAt!);
    expect(times).toEqual([...times].sort().reverse());
    expect(f1.documents.at(-1)).toMatchObject({ number: 1, title: "Competition Visa" });
  });

  it("reads the F2 page, whose rows carry extra field wrappers", () => {
    const f2 = parseFiaDocumentsPage(f2Html)!;
    expect(f2.event).toBe("Baku");
    expect(f2.documents.map((d) => d.number)).toEqual([101, 100, 99, 98, 97, 96, 95, 4, 3, 2, 1]);
    expect(f2.documents[4]).toMatchObject({ title: "DECISION - Car 15 - alleged yellow flag violation", kind: "stewards" });
    expect(f2.documents[0].publishedAt).toBe("2026-09-26T11:07:00.000Z");
  });

  it("returns null when the page has no document list", () => {
    expect(parseFiaDocumentsPage("<html><body><p>Maintenance</p></body></html>")).toBeNull();
  });
});

describe("fiaPublishedToIso", () => {
  it("reads the time as Paris wall-clock time, whatever the CET label says", () => {
    // Summer: CEST, UTC+2. FP1 in Singapore ended 09:30 UTC; its classification is "12:38 CET".
    expect(fiaPublishedToIso("09.10.26 12:38")).toBe("2026-10-09T10:38:00.000Z");
    // Winter: CET, UTC+1.
    expect(fiaPublishedToIso("06.12.26 15:10")).toBe("2026-12-06T14:10:00.000Z");
  });

  it("returns null for anything else", () => {
    expect(fiaPublishedToIso("")).toBeNull();
    expect(fiaPublishedToIso("Published soon")).toBeNull();
  });
});

describe("splitDocumentTitle", () => {
  it("handles the prefix variants and titles without one", () => {
    expect(splitDocumentTitle("Doc 7 - Competition Notes - Circuit Map")).toEqual({ number: 7, title: "Competition Notes - Circuit Map" });
    expect(splitDocumentTitle("  Doc 12 –  Entry List ")).toEqual({ number: 12, title: "Entry List" });
    expect(splitDocumentTitle("Entry List")).toEqual({ number: null, title: "Entry List" });
  });
});

describe("fiaDocumentKind", () => {
  it.each([
    ["Infringement - Car 3 - Yellow flag infringement", "stewards"],
    ["Summons - Car 44 - Alleged Yellow Flag Infringement", "stewards"],
    ["Decision - Sprint Qualifying SC2-SC1 Times", "stewards"],
    ["Offence - Car 1 - Causing a collision", "stewards"],
    ["Final Sprint Qualifying Classification", "results"],
    ["Provisional Sprint Starting Grid", "results"],
    ["F2 Driver Championship - Baku 2026", "results"],
    ["Race Director Notes - SC2 - SC1 Times", "other"],
    ["Competition Visa", "other"],
    ["New PU Elements for this Competition", "other"],
  ] as const)("%s → %s", (title, kind) => {
    expect(fiaDocumentKind(title)).toBe(kind);
  });
});

describe("eventMatchesRound", () => {
  const f1 = parseFiaDocumentsPage(f1Html)!;
  const f2 = parseFiaDocumentsPage(f2Html)!;
  const marinaBay = getCircuit("marina-bay")!;
  const baku = getCircuit("baku")!;
  const singapore = makeRound("f1-2026-marina-bay", "marina-bay", "2026-10-09", "2026-10-11", { name: "Singapore Grand Prix" });

  it("matches an F1 event by the Round's name", () => {
    expect(eventMatchesRound(f1, singapore, marinaBay)).toBe(true);
  });

  it("matches an F1 event by name when the Round has moved Circuit", () => {
    const listing: FiaEventDocuments = { ...f1, event: "Bahrain Grand Prix" };
    const sepang = makeRound("f1-2026-sepang", "sepang", "2026-10-09", "2026-10-11", { name: "Bahrain Grand Prix" });
    expect(eventMatchesRound(listing, sepang, getCircuit("sepang")!)).toBe(true);
  });

  it("matches an F2 event by place name through the Circuit aliases", () => {
    const round = makeRound("f2-2026-baku", "baku", "2026-09-25", "2026-09-27", { name: "Round 12" });
    expect(eventMatchesRound(f2, round, baku)).toBe(true);
    const monaco = makeRound("f2-2026-monaco", "monaco", "2026-06-05", "2026-06-07", { name: "Round 5" });
    expect(eventMatchesRound({ ...f2, event: "Monte-Carlo", documents: shift(f2, "2026-06-06") }, monaco, getCircuit("monaco")!)).toBe(true);
  });

  it("does not match the previous Round while the FIA still lists it first", () => {
    const austin = makeRound("f1-2026-cota", "cota", "2026-10-23", "2026-10-25", { name: "United States Grand Prix" });
    expect(eventMatchesRound(f1, austin, getCircuit("cota")!)).toBe(false);
  });

  it("does not match last season's event of the same name", () => {
    const next = makeRound("f1-2027-marina-bay", "marina-bay", "2027-10-08", "2027-10-10", { name: "Singapore Grand Prix" });
    expect(eventMatchesRound(f1, next, marinaBay)).toBe(false);
  });

  it("does not match without readable publish dates", () => {
    const undated = { ...f1, documents: f1.documents.map((d) => ({ ...d, publishedAt: null })) };
    expect(eventMatchesRound(undated, singapore, marinaBay)).toBe(false);
  });
});

describe("fetchFiaDocuments", () => {
  it("throws when the page layout has changed", async () => {
    const ctx = { fetch: async () => new Response("<html></html>"), sleep: async () => {} };
    await expect(fetchFiaDocuments(ctx, "f1")).rejects.toThrow(/No document list/);
  });

  it("throws on an HTTP error", async () => {
    const ctx = { fetch: async () => new Response("", { status: 503 }), sleep: async () => {} };
    await expect(fetchFiaDocuments(ctx, "f3")).rejects.toThrow(/HTTP 503/);
  });
});

/** The listing's documents, all re-dated to `day`. */
function shift(listing: FiaEventDocuments, day: string) {
  return listing.documents.map((d) => ({ ...d, publishedAt: `${day}T12:00:00.000Z` }));
}
