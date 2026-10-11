import { describe, expect, it } from "vitest";
import type { FiaDocument } from "@/domain/types";
import { fiaDocumentId } from "@/lib/fia-document-path";
import { matchDocumentPage, type DocumentListing } from "./page";

function doc(number: number | null, file: string | null, title = `Document ${number}`): FiaDocument {
  return {
    number,
    title,
    kind: "stewards",
    url: `https://www.fia.com/system/files/decision-document/${file ?? "elsewhere.pdf"}`,
    file,
    publishedAt: "2026-10-10T19:00:00.000Z",
  };
}

const IMPEDING = "2026_singapore_grand_prix_-_infringement_-_car_27_-_impeding_of_car_55.pdf";
const UNNUMBERED = "2026_singapore_grand_prix_-_team_managers_meeting.pdf";

const listing: DocumentListing = {
  event: "Singapore Grand Prix",
  documents: [
    doc(73, IMPEDING, "Infringement – Car 27 – Impeding of Car 55"),
    doc(null, UNNUMBERED, "Team managers' meeting"),
    doc(72, null),
    doc(1, "2026_singapore_grand_prix_-_entry_list.pdf"),
  ],
};

describe("matchDocumentPage", () => {
  it("finds a document by event and number", () => {
    const match = matchDocumentPage("singapore-grand-prix-73", listing);
    expect(match).toMatchObject({ kind: "listed", doc: { number: 73, file: IMPEDING } });
  });

  it("finds a document with no number by its hash", () => {
    const id = fiaDocumentId({ number: null, file: UNNUMBERED });
    expect(matchDocumentPage(`singapore-grand-prix-${id}`, listing)).toMatchObject({ kind: "listed", doc: { file: UNNUMBERED } });
  });

  it("refuses another Round's link, rather than show this Round's document with that number", () => {
    expect(matchDocumentPage("austin-grand-prix-73", listing)).toEqual({ kind: "unknown" });
    expect(matchDocumentPage("singapore-grand-prix-73", null)).toEqual({ kind: "unknown" });
  });

  it("refuses numbers that are not listed or not in our viewer", () => {
    expect(matchDocumentPage("singapore-grand-prix-99", listing)).toEqual({ kind: "unknown" });
    expect(matchDocumentPage("singapore-grand-prix-72", listing)).toEqual({ kind: "unknown" });
    expect(matchDocumentPage("singapore-grand-prix-073", listing)).toEqual({ kind: "unknown" });
  });

  it("moves an older file-name link for a listed document to its page", () => {
    expect(matchDocumentPage(IMPEDING.replace(".pdf", ""), listing)).toEqual({ kind: "moved", id: "73" });
    expect(matchDocumentPage(encodeURIComponent(IMPEDING.replace(".pdf", "")), listing)).toEqual({ kind: "moved", id: "73" });
  });

  it("keeps an older file-name link for a document no longer listed, to check on fia.com", () => {
    expect(matchDocumentPage("2026_las_vegas_grand_prix_-_entry_list", listing)).toEqual({
      kind: "unlisted",
      file: "2026_las_vegas_grand_prix_-_entry_list.pdf",
    });
    expect(matchDocumentPage("2026_las_vegas_grand_prix_-_entry_list", null)).toMatchObject({ kind: "unlisted" });
  });

  it("refuses slugs that are no file name", () => {
    expect(matchDocumentPage("..%2Fsecret", listing)).toEqual({ kind: "unknown" });
    expect(matchDocumentPage("", listing)).toEqual({ kind: "unknown" });
  });
});
