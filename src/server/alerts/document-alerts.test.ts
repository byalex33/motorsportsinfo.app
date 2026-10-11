import { describe, expect, it } from "vitest";
import {
  documentPayload,
  documentSummaryPayload,
  hasDocumentAlerts,
  normalizeDocumentAlerts,
  planDocumentPushes,
  setDocumentAlert,
  wantsDocument,
  type DocumentAlertRow,
} from "./document-alerts";
import type { AlertSubscription } from "./types";

function sub(id: string, documentAlerts: AlertSubscription["documentAlerts"]): AlertSubscription {
  return { id, endpoint: `https://push.example/${id}`, p256dh: "p", auth: "a", leadMinutes: 15, follows: {}, documentAlerts, timeZone: "UTC", failureCount: 0 };
}

function doc(number: number, kind: DocumentAlertRow["kind"], overrides: Partial<DocumentAlertRow> = {}): DocumentAlertRow {
  return {
    url: `https://www.fia.com/system/files/decision-document/doc_${number}.pdf`,
    series: "f1",
    event: "Singapore Grand Prix",
    number,
    title: `Document ${number}`,
    kind,
    file: `doc_${number}.pdf`,
    publishedAt: new Date(Date.UTC(2026, 9, 9, 12, number)),
    ...overrides,
  };
}

describe("normalizeDocumentAlerts", () => {
  it("keeps FIA Series with a known level only", () => {
    expect(normalizeDocumentAlerts({ f1: "stewards", f2: "all", wec: "all", f3: "loud" })).toEqual({ f1: "stewards", f2: "all" });
    expect(normalizeDocumentAlerts(null)).toEqual({});
    expect(normalizeDocumentAlerts("all")).toEqual({});
  });

  it("sets and clears one Series", () => {
    expect(setDocumentAlert({ f1: "all" }, "f2", "stewards")).toEqual({ f1: "all", f2: "stewards" });
    expect(setDocumentAlert({ f1: "all", f2: "stewards" }, "f1", null)).toEqual({ f2: "stewards" });
    expect(hasDocumentAlerts({})).toBe(false);
    expect(hasDocumentAlerts({ f3: "all" })).toBe(true);
  });
});

describe("wantsDocument", () => {
  it("matches stewards' documents for Stewards, and everything for All", () => {
    expect(wantsDocument({ f1: "stewards" }, "f1", "stewards")).toBe(true);
    expect(wantsDocument({ f1: "stewards" }, "f1", "results")).toBe(false);
    expect(wantsDocument({ f1: "all" }, "f1", "other")).toBe(true);
    expect(wantsDocument({ f1: "all" }, "f2", "stewards")).toBe(false);
  });
});

describe("payloads", () => {
  it("leads with the title and opens the document in our viewer", () => {
    const payload = documentPayload(doc(29, "stewards", { title: "Infringement - Car 3 - Yellow flag infringement", file: "2026_x_-_car_3.pdf" }));
    expect(payload).toEqual({
      title: "Infringement - Car 3 - Yellow flag infringement",
      body: "FIA Doc 29 · F1 Singapore Grand Prix",
      url: "/f1/documents/singapore-grand-prix-29",
      tag: "fia-document:https://www.fia.com/system/files/decision-document/doc_29.pdf",
    });
  });

  it("keeps the file name, which spells out the title, out of the URL", () => {
    const payload = documentPayload(doc(3, "stewards", { number: null, file: "2026_x_-_infringement_-_car_3.pdf" }));
    expect(payload.url).toMatch(/^\/f1\/documents\/singapore-grand-prix-h[0-9a-f]{8}$/);
  });

  it("opens the Series page for a document the viewer cannot open", () => {
    expect(documentPayload(doc(3, "other", { file: null, number: null })).url).toBe("/f1#documents");
    expect(documentPayload(doc(3, "other", { number: null })).body).toBe("FIA document · F1 Singapore Grand Prix");
  });

  it("summarises several documents with the first two titles", () => {
    const payload = documentSummaryPayload("f1", [doc(5, "stewards"), doc(4, "stewards"), doc(3, "stewards"), doc(2, "stewards")]);
    expect(payload).toMatchObject({
      title: "4 new FIA documents · F1 Singapore Grand Prix",
      body: "Document 5 · Document 4 and 2 more",
      url: "/f1#documents",
      tag: "fia-documents:f1",
    });
  });
});

describe("planDocumentPushes", () => {
  const stewardsOnly = sub("a", { f1: "stewards" });
  const everything = sub("b", { f1: "all", f2: "all" });
  const nothing = sub("c", {});

  it("sends each device only what it chose", () => {
    const pushes = planDocumentPushes([doc(1, "stewards"), doc(2, "results")], [stewardsOnly, everything, nothing]);
    expect(pushes.map((p) => [p.subscription.id, p.payload.title])).toEqual([
      ["a", "Document 1"],
      ["b", "Document 2"],
      ["b", "Document 1"],
    ]);
    expect(pushes.every((p) => p.ttlSeconds === 3 * 60 * 60)).toBe(true);
  });

  it("sends two documents on their own, more as one summary per Series", () => {
    const two = planDocumentPushes([doc(1, "other"), doc(2, "other")], [everything]);
    expect(two).toHaveLength(2);
    const three = planDocumentPushes([doc(1, "other"), doc(2, "other"), doc(3, "other"), doc(9, "other", { series: "f2", event: "Baku" })], [everything]);
    expect(three.map((p) => p.payload.tag)).toEqual(["fia-documents:f1", "fia-document:https://www.fia.com/system/files/decision-document/doc_9.pdf"]);
  });

  it("sends nothing when no one chose documents", () => {
    expect(planDocumentPushes([doc(1, "stewards")], [nothing])).toEqual([]);
    expect(planDocumentPushes([], [everything])).toEqual([]);
  });
});
