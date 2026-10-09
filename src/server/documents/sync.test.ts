import { describe, expect, it } from "vitest";
import { getCircuit } from "@/data/circuits";
import { makeRound } from "@/server/schedule/test-utils";
import type { FiaEventDocuments } from "./fia";
import { documentRows, watchedRounds } from "./sync";

const marinaBay = getCircuit("marina-bay")!;
const singapore = makeRound("f1-2026-marina-bay", "marina-bay", "2026-10-09", "2026-10-11", { name: "Singapore Grand Prix" });
const austin = makeRound("f1-2026-cota", "cota", "2026-10-23", "2026-10-25", { name: "United States Grand Prix" });

describe("watchedRounds", () => {
  const entries = [
    { round: singapore, circuit: marinaBay },
    { round: singapore, circuit: marinaBay },
    { round: austin, circuit: getCircuit("cota")! },
  ];

  it("watches a Round from 4 days before its first day to 1 day after its last", () => {
    const ids = (iso: string) => watchedRounds(entries, new Date(iso)).map((w) => w.round.id);
    expect(ids("2026-10-04T23:59:00Z")).toEqual([]);
    expect(ids("2026-10-05T00:00:00Z")).toEqual(["f1-2026-marina-bay"]);
    expect(ids("2026-10-12T22:00:00Z")).toEqual(["f1-2026-marina-bay"]);
    expect(ids("2026-10-13T00:00:00Z")).toEqual([]);
    expect(ids("2026-10-20T12:00:00Z")).toEqual(["f1-2026-cota"]);
  });
});

describe("documentRows", () => {
  const now = new Date("2026-10-09T16:00:00Z");
  const listing: FiaEventDocuments = {
    event: "Singapore Grand Prix",
    documents: [
      { number: 33, title: "Provisional Sprint Starting Grid", kind: "results", url: "https://www.fia.com/a.pdf", file: "a.pdf", publishedAt: "2026-10-09T15:30:00.000Z" },
      { number: 1, title: "Competition Visa", kind: "other", url: "https://www.fia.com/b.pdf", file: "b.pdf", publishedAt: "2026-10-07T02:20:00.000Z" },
      { number: null, title: "Undated", kind: "other", url: "https://www.fia.com/c.pdf", file: null, publishedAt: null },
    ],
  };

  it("leaves only fresh documents to be pushed", () => {
    const rows = documentRows(listing, singapore, now, { firstLook: false });
    expect(rows.map((r) => [r.number, r.notifiedAt])).toEqual([
      [33, null],
      [1, now],
      [null, null],
    ]);
    expect(rows[0]).toMatchObject({ series: "f1", roundId: "f1-2026-marina-bay", event: "Singapore Grand Prix", file: "a.pdf" });
  });

  it("never pushes an undated document on the first look at a Round", () => {
    const rows = documentRows(listing, singapore, now, { firstLook: true });
    expect(rows[2].notifiedAt).toEqual(now);
    expect(rows[0].notifiedAt).toBeNull();
  });

  it("stops pushing a document an hour after it was published", () => {
    const later = new Date("2026-10-09T16:30:01Z");
    expect(documentRows(listing, singapore, later, { firstLook: false })[0].notifiedAt).toEqual(later);
  });
});
