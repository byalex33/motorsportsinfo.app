// The cached due-check in front of syncSeries: most cron runs have nothing to do and must not wake the
// database. These tests stop before a check runs, so nothing is fetched or written.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { pendingSessionChanges, sourceChecks } from "@/db/schema";
import { CONFIRM_CHANGE_MS } from "./check-due";
import { MINUTE } from "./time";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));

const client = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/db/client", () => client);

const dbRead = vi.hoisted(() => ({ loadPublishedSchedule: vi.fn() }));
vi.mock("./db-read", () => dbRead);

const { syncSeries } = await import("./sync");

const NOW = new Date("2026-11-08T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

interface Rows {
  check?: { lastCheckedAt: Date; lastSucceededAt: Date | null };
  pending?: string[];
}

/**
 * A fake drizzle db answering `select().from(table).where()` (and `.limit()`) from fixed rows. Tables
 * not listed answer []. `select` is a spy, so a test can tell whether the database was read at all.
 */
function fakeDb({ check, pending = [] }: Rows) {
  const rowsFor = (table: unknown): unknown[] => {
    if (table === sourceChecks) return check ? [{ series: "wrc", lastSource: null, lastError: null, ...check }] : [];
    if (table === pendingSessionChanges) {
      return pending.map((sessionId) => ({
        sessionId,
        observedStartsAt: new Date("2026-11-20T08:00:00Z"),
        observedEndsAt: new Date("2026-11-20T09:00:00Z"),
        seenCount: 1,
        firstSeenAt: ago(CONFIRM_CHANGE_MS),
      }));
    }
    return [];
  };
  const select = vi.fn(() => ({
    from: (table: unknown) => ({
      where: () => {
        const rows = Promise.resolve(rowsFor(table));
        return Object.assign(rows, { limit: (n: number) => rows.then((r) => r.slice(0, n)) });
      },
    }),
  }));
  const update = vi.fn((table: unknown) => ({
    set: (values: Record<string, unknown>) => ({ where: () => Promise.resolve({ table, values }) }),
  }));
  const insert = vi.fn(() => ({ values: () => ({ onConflictDoUpdate: () => Promise.resolve() }) }));
  return { select, insert, update } as unknown as Db & { select: typeof select; update: typeof update };
}

/** What the database says when it is asked: checked a minute ago, nothing pending, so nothing is due. */
const notDueInDb = () => fakeDb({ check: { lastCheckedAt: ago(MINUTE), lastSucceededAt: ago(MINUTE) } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  dbRead.loadPublishedSchedule.mockResolvedValue([]);
});

describe("syncSeries' cached due-check", () => {
  it("lets the database decide when there is no check hint", async () => {
    client.getDb.mockReturnValue(null);
    const db = notDueInDb();
    expect(await syncSeries(db, "wrc", { now: NOW })).toMatchObject({ status: "skipped" });
    expect(db.select).toHaveBeenCalled();
  });

  it("lets the database decide when the published schedule can't be read", async () => {
    client.getDb.mockReturnValue(fakeDb({ check: { lastCheckedAt: ago(MINUTE), lastSucceededAt: ago(MINUTE) } }));
    dbRead.loadPublishedSchedule.mockResolvedValue(null);
    const db = notDueInDb();
    await syncSeries(db, "wrc", { now: NOW });
    expect(db.select).toHaveBeenCalled();
  });

  it("lets the database decide when the cached read fails", async () => {
    client.getDb.mockReturnValue(fakeDb({ check: { lastCheckedAt: ago(MINUTE), lastSucceededAt: ago(MINUTE) } }));
    dbRead.loadPublishedSchedule.mockRejectedValue(new Error("cache unavailable"));
    const db = notDueInDb();
    await syncSeries(db, "wrc", { now: NOW });
    expect(db.select).toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("[sync:wrc] cached due-check failed"));
  });

  it("never reads the database when nothing is due", async () => {
    client.getDb.mockReturnValue(fakeDb({ check: { lastCheckedAt: ago(MINUTE), lastSucceededAt: ago(MINUTE) } }));
    const db = notDueInDb();
    expect(await syncSeries(db, "wrc", { now: NOW })).toEqual({ series: "wrc", status: "skipped", published: false });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("asks the database 10 minutes after a check that left a pending change, and not before", async () => {
    const hint = (since: number) =>
      fakeDb({ check: { lastCheckedAt: ago(since), lastSucceededAt: ago(since) }, pending: ["wrc-2026-japan:day-1"] });

    client.getDb.mockReturnValue(hint(CONFIRM_CHANGE_MS - MINUTE));
    const early = notDueInDb();
    await syncSeries(early, "wrc", { now: NOW });
    expect(early.select).not.toHaveBeenCalled();

    client.getDb.mockReturnValue(hint(CONFIRM_CHANGE_MS));
    const due = notDueInDb();
    await syncSeries(due, "wrc", { now: NOW });
    expect(due.select).toHaveBeenCalled();
  });

  it("without a pending change, waits for the daily check", async () => {
    client.getDb.mockReturnValue(fakeDb({ check: { lastCheckedAt: ago(CONFIRM_CHANGE_MS), lastSucceededAt: ago(CONFIRM_CHANGE_MS) } }));
    const db = notDueInDb();
    await syncSeries(db, "wrc", { now: NOW });
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("syncSeries and the run deadline", () => {
  it("fails the check when the run signal aborts while a source never answers", async () => {
    client.getDb.mockReturnValue(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = notDueInDb();
    const run = new AbortController();
    const ctx = { sleep: async () => {}, fetch: () => new Promise<Response>(() => {}) };
    const result = syncSeries(db, "wrc", { now: NOW, force: true, ctx, signal: run.signal });
    run.abort(new Error("sync run deadline (240 s) passed"));
    expect(await result).toMatchObject({ series: "wrc", status: "failed", published: false });
    expect((await result).error).toContain("sync run deadline (240 s) passed");
    expect(db.update).toHaveBeenCalledWith(sourceChecks);
  });
});
