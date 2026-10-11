import { describe, expect, it } from "vitest";
import { fiaDocumentId, fiaDocumentIds, fiaDocumentPagePath, fiaEventSlug, parseFiaDocumentPageSlug } from "./fia-document-path";

const FILE = "2026_singapore_grand_prix_-_infringement_-_car_27_-_impeding_of_car_55.pdf";

describe("fiaEventSlug", () => {
  it("reduces the FIA's event name to plain words", () => {
    expect(fiaEventSlug("Singapore Grand Prix")).toBe("singapore-grand-prix");
    expect(fiaEventSlug("Spa-Francorchamps")).toBe("spa-francorchamps");
    expect(fiaEventSlug("São Paulo Grand Prix")).toBe("sao-paulo-grand-prix");
    expect(fiaEventSlug("  ")).toBe("round");
  });
});

describe("fiaDocumentId", () => {
  it("uses the document's number", () => {
    expect(fiaDocumentId({ number: 73, file: FILE })).toBe("73");
  });

  it("falls back to a stable hash that gives nothing away", () => {
    const id = fiaDocumentId({ number: null, file: FILE });
    expect(id).toMatch(/^h[0-9a-f]{8}$/);
    expect(fiaDocumentId({ number: null, file: FILE })).toBe(id);
    expect(fiaDocumentId({ number: null, file: "2026_other.pdf" })).not.toBe(id);
  });
});

describe("fiaDocumentIds", () => {
  it("keeps a reused number with the newest document", () => {
    const ids = fiaDocumentIds([
      { number: 12, file: "doc_12_v2.pdf" },
      { number: 12, file: "doc_12.pdf" },
      { number: 11, file: "doc_11.pdf" },
    ]);
    expect(ids[0]).toBe("12");
    expect(ids[1]).toBe(fiaDocumentId({ number: null, file: "doc_12.pdf" }));
    expect(ids[2]).toBe("11");
  });
});

describe("viewer page slugs", () => {
  it("names the Round and the document, never the title", () => {
    const path = fiaDocumentPagePath("f1", "Singapore Grand Prix", "73");
    expect(path).toBe("/f1/documents/singapore-grand-prix-73");
    expect(path).not.toMatch(/car/i);
  });

  it("parses what fiaDocumentPagePath makes", () => {
    expect(parseFiaDocumentPageSlug("singapore-grand-prix-73")).toEqual({ event: "singapore-grand-prix", id: "73" });
    expect(parseFiaDocumentPageSlug("round-3-12")).toEqual({ event: "round-3", id: "12" });
    expect(parseFiaDocumentPageSlug("baku-h0a1b2c3d")).toEqual({ event: "baku", id: "h0a1b2c3d" });
  });

  it("does not take an older file-name slug for one", () => {
    expect(parseFiaDocumentPageSlug(FILE.replace(".pdf", ""))).toBeNull();
    expect(parseFiaDocumentPageSlug("2026_singapore_grand_prix_-_entry_list")).toBeNull();
    expect(parseFiaDocumentPageSlug("73")).toBeNull();
    expect(parseFiaDocumentPageSlug("nonexistent")).toBeNull();
  });
});
