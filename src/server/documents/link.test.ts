import { describe, expect, it } from "vitest";
import type { FiaDocument } from "@/domain/types";
import { fiaDocumentId } from "@/lib/fia-document-path";
import { matchDocumentLink, type DocumentListing } from "./link";

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

describe("matchDocumentLink", () => {
  it("finds a listed document by event and number", () => {
    expect(matchDocumentLink("singapore-grand-prix-73", listing)).toEqual({ kind: "file", file: IMPEDING });
  });

  it("finds a listed document with no number by its hash", () => {
    const id = fiaDocumentId({ number: null, file: UNNUMBERED });
    expect(matchDocumentLink(`singapore-grand-prix-${id}`, listing)).toEqual({ kind: "file", file: UNNUMBERED });
  });

  it("sends another Round's link, or a number not listed, to be looked up elsewhere", () => {
    expect(matchDocumentLink("austin-grand-prix-73", listing)).toEqual({ kind: "elsewhere", event: "austin-grand-prix", id: "73" });
    expect(matchDocumentLink("singapore-grand-prix-73", null)).toEqual({ kind: "elsewhere", event: "singapore-grand-prix", id: "73" });
    expect(matchDocumentLink("singapore-grand-prix-99", listing)).toMatchObject({ kind: "elsewhere" });
    expect(matchDocumentLink("singapore-grand-prix-72", listing)).toMatchObject({ kind: "elsewhere" });
    expect(matchDocumentLink("singapore-grand-prix-073", listing)).toMatchObject({ kind: "elsewhere" });
  });

  it("reads an older link that names the file, listed or not", () => {
    expect(matchDocumentLink(IMPEDING.replace(".pdf", ""), listing)).toEqual({ kind: "file", file: IMPEDING });
    expect(matchDocumentLink(encodeURIComponent(IMPEDING.replace(".pdf", "")), listing)).toEqual({ kind: "file", file: IMPEDING });
    expect(matchDocumentLink("2026_las_vegas_grand_prix_-_entry_list", null)).toEqual({
      kind: "file",
      file: "2026_las_vegas_grand_prix_-_entry_list.pdf",
    });
  });

  it("refuses slugs that are no file name", () => {
    expect(matchDocumentLink("..%2Fsecret", listing)).toEqual({ kind: "unknown" });
    expect(matchDocumentLink("", listing)).toEqual({ kind: "unknown" });
  });
});
