// What the sync cron revalidates. The Series' checks and the FIA Documents sync are stubbed.
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncResult } from "@/server/schedule/sync";

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/cache", () => cache);
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/cron", () => ({ isCronRequest: () => true }));
vi.mock("@/server/alerts/wake", () => ({ UNSENT_PUSHES_TAG: "alerts:unsent" }));
vi.mock("@/server/schedule", () => ({ scheduleTag: (series: string) => `schedule:${series}` }));
vi.mock("@/server/documents", () => ({
  fiaDocumentsTag: (series: string) => `fia-documents:${series}`,
  hasFiaDocuments: () => false,
  syncFiaDocuments: vi.fn(),
}));
const sync = vi.hoisted(() => ({ syncSeries: vi.fn() }));
vi.mock("@/server/schedule/sync", () => sync);

const { GET } = await import("./route");

const request = (query: string) => ({ nextUrl: new URL(`https://motorsportsinfo.app/api/cron/sync?${query}`) }) as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/cron/sync", () => {
  it("revalidates nothing when no check published anything", async () => {
    sync.syncSeries.mockResolvedValue({ series: "f1", status: "skipped", published: false } satisfies SyncResult);
    const response = await GET(request("series=f1"));
    expect(response.status).toBe(200);
    expect(cache.revalidateTag).not.toHaveBeenCalled();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates a Series and wakes the push pass when its check publishes a Schedule Change", async () => {
    sync.syncSeries.mockResolvedValue({ series: "f1", status: "synced", published: true, summary: { changes: 1 } } satisfies SyncResult);
    await GET(request("series=f1"));
    expect(cache.revalidateTag).toHaveBeenCalledWith("schedule:f1", { expire: 0 });
    expect(cache.revalidateTag).toHaveBeenCalledWith("alerts:unsent", { expire: 0 });
  });

  it("revalidates a Series whose check threw, and wakes the push pass, as its plan may already be written", async () => {
    sync.syncSeries.mockImplementation(async (_db: unknown, id: string) => {
      if (id === "wec") throw new Error("query timed out");
      return { series: id, status: "skipped", published: false };
    });
    const response = await GET(request("series=f1,wec"));
    expect(response.status).toBe(500);
    expect(cache.revalidateTag).toHaveBeenCalledWith("schedule:wec", { expire: 0 });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/wec", "layout");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/calendar");
    expect(cache.revalidateTag).toHaveBeenCalledWith("alerts:unsent", { expire: 0 });
    expect(cache.revalidateTag).not.toHaveBeenCalledWith("schedule:f1", { expire: 0 });
  });
});
