import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FiaEventDocuments } from "./fia";

const cacheTag = vi.fn();
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag }));
vi.mock("./sync", () => ({ syncFiaDocuments: vi.fn() }));

const fetchFiaDocuments = vi.fn<() => Promise<FiaEventDocuments>>();
vi.mock("./fia", async (importOriginal) => ({ ...(await importOriginal<typeof import("./fia")>()), fetchFiaDocuments }));

/** A stand-in for Drizzle's select().from().where(): counts reads and answers with `rows`. */
const reads = vi.fn();
let rows: { event: string; number: number | null; file: string | null }[] = [];
const db = {
  select: () => ({
    from: () => ({
      where: (...args: unknown[]) => {
        reads(...args);
        return Promise.resolve(rows);
      },
    }),
  }),
};
let dbAvailable = true;
vi.mock("@/db/client", () => ({ getDb: () => (dbAvailable ? db : null) }));

const { fiaDocumentLink } = await import("./index");

const FILE = "2026_singapore_grand_prix_-_decision_-_car_1.pdf";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  dbAvailable = true;
  rows = [{ event: "Singapore Grand Prix", number: 73, file: FILE }];
  fetchFiaDocuments.mockResolvedValue({ event: "United States Grand Prix", documents: [] } as unknown as FiaEventDocuments);
});

describe("fiaDocumentLink", () => {
  it("finds an earlier Round's stored document", async () => {
    await expect(fiaDocumentLink("f1", "singapore-grand-prix-73")).resolves.toBe(`https://www.fia.com/system/files/decision-document/${FILE}`);
  });

  it("reads the Series' stored documents with one query that doesn't depend on the slug, tagged for the sync", async () => {
    await expect(fiaDocumentLink("f1", "a-1")).resolves.toBeNull();
    await expect(fiaDocumentLink("f1", "a-2")).resolves.toBeNull();
    // One read per call here (vitest has no "use cache" runtime); on Vercel the read is cached per Series,
    // so made-up slugs share it. Both reads are the same query, keyed only by the Series.
    expect(reads).toHaveBeenCalledTimes(2);
    expect(reads.mock.calls[0]).toEqual(reads.mock.calls[1]);
    expect(cacheTag).toHaveBeenCalledWith("fia-documents:f1");
  });

  it("still redirects from the live listing without a database", async () => {
    dbAvailable = false;
    fetchFiaDocuments.mockResolvedValue({
      event: "Singapore Grand Prix",
      documents: [{ number: 73, title: "Decision", file: FILE }],
    } as unknown as FiaEventDocuments);
    await expect(fiaDocumentLink("f1", "singapore-grand-prix-73")).resolves.toBe(`https://www.fia.com/system/files/decision-document/${FILE}`);
    await expect(fiaDocumentLink("f1", "singapore-grand-prix-74")).resolves.toBeNull();
  });
});
