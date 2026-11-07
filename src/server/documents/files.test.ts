import { describe, expect, it } from "vitest";
import { FIA_DOCUMENT_FOLDER, fiaDocumentFile, fiaDocumentFileFromSlug, fiaDocumentSource } from "./files";

const FILE = "2026_singapore_grand_prix_-_provisional_sprint_starting_grid.pdf";
const SOURCE = FIA_DOCUMENT_FOLDER + FILE;

describe("fiaDocumentFile", () => {
  it("reads the file name of a PDF in the FIA's decision-document folder", () => {
    expect(fiaDocumentFile(SOURCE)).toBe(FILE);
    expect(fiaDocumentFile(`${FIA_DOCUMENT_FOLDER}2026_s%C3%A3o_paulo_-_entry_list.pdf`)).toBe("2026_são_paulo_-_entry_list.pdf");
  });

  it.each([
    ["another host", `https://evil.example/system/files/decision-document/${FILE}`],
    ["another folder", `https://www.fia.com/system/files/other/${FILE}`],
    ["a subfolder", `${FIA_DOCUMENT_FOLDER}2026/${FILE}`],
    ["an encoded slash", `${FIA_DOCUMENT_FOLDER}..%2Fsecret.pdf`],
    ["not a PDF", `${FIA_DOCUMENT_FOLDER}notes.docx`],
    ["not a URL", "Doc 33"],
  ])("refuses %s", (_, url) => {
    expect(fiaDocumentFile(url)).toBeNull();
  });
});

describe("fiaDocumentFileFromSlug", () => {
  it("adds the extension back, decoding the slug if it is still encoded", () => {
    expect(fiaDocumentFileFromSlug(FILE.replace(".pdf", ""))).toBe(FILE);
    expect(fiaDocumentFileFromSlug("2026_s%C3%A3o_paulo_-_entry_list")).toBe("2026_são_paulo_-_entry_list.pdf");
    expect(fiaDocumentFileFromSlug("2026_são_paulo_-_entry_list")).toBe("2026_são_paulo_-_entry_list.pdf");
  });

  it("refuses anything that is not a bare file name", () => {
    expect(fiaDocumentFileFromSlug("..%2Fsecret")).toBeNull();
    expect(fiaDocumentFileFromSlug("a/b")).toBeNull();
    expect(fiaDocumentFileFromSlug("")).toBeNull();
  });
});

describe("fiaDocumentSource", () => {
  it("only accepts a bare PDF file name", () => {
    expect(fiaDocumentSource(FILE)).toBe(SOURCE);
    expect(fiaDocumentSource("../x.pdf")).toBeNull();
    expect(fiaDocumentSource("a/b.pdf")).toBeNull();
    expect(fiaDocumentSource("a\\b.pdf")).toBeNull();
    expect(fiaDocumentSource(".pdf")).toBeNull();
    expect(fiaDocumentSource("x.pdf?y=1")).toBeNull();
    expect(fiaDocumentSource("x.html")).toBeNull();
  });
});
