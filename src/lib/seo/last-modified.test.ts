import { describe, expect, it } from "vitest";
import type { FiaDocument, RoundDocumentsResult } from "@/domain/types";
import { seriesLastModified } from "./last-modified";

const fallback = new Date("2026-10-01T00:00:00Z");

function doc(publishedAt: string | null): FiaDocument {
  return { number: 1, title: "Doc", kind: "other", url: "https://www.fia.com/x.pdf", file: null, publishedAt };
}

function docs(...publishedAt: (string | null)[]): RoundDocumentsResult {
  return { kind: "documents", event: "Singapore Grand Prix", documents: publishedAt.map(doc), sourceUrl: "https://www.fia.com/documents" };
}

describe("seriesLastModified", () => {
  it("uses the schedule change time when there are no documents", () => {
    expect(seriesLastModified({ scheduleUpdatedAt: "2026-10-05T10:00:00.000Z", documents: null, fallback })).toEqual(
      new Date("2026-10-05T10:00:00Z"),
    );
  });

  it("takes the newest of the schedule change and the FIA Documents", () => {
    const documents = docs("2026-10-10T19:47:00Z", null, "2026-10-09T08:00:00Z");
    expect(seriesLastModified({ scheduleUpdatedAt: "2026-10-05T10:00:00Z", documents, fallback })).toEqual(new Date("2026-10-10T19:47:00Z"));
  });

  it("uses the newest FIA Document without a schedule time", () => {
    expect(seriesLastModified({ scheduleUpdatedAt: null, documents: docs("2026-10-09T08:00:00Z"), fallback })).toEqual(
      new Date("2026-10-09T08:00:00Z"),
    );
  });

  it("falls back when nothing is known", () => {
    expect(seriesLastModified({ scheduleUpdatedAt: null, documents: null, fallback })).toBe(fallback);
    expect(seriesLastModified({ scheduleUpdatedAt: null, documents: { kind: "none", sourceUrl: "x" }, fallback })).toBe(fallback);
    expect(seriesLastModified({ scheduleUpdatedAt: "not a date", documents: docs(null), fallback })).toBe(fallback);
  });
});
