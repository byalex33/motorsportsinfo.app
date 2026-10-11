import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SLUGS = ["practice-1", "qualifying", "race"];

async function run(path: string) {
  const { proxy } = await import("./proxy");
  return proxy(new NextRequest(`https://motorsportsinfo.app${path}`));
}

function rewrittenTo(res: Response): string | null {
  return res.headers.get("x-middleware-rewrite");
}

describe("proxy: Telemetry URLs", () => {
  beforeEach(() => {
    // The list is remembered between requests, so each test starts from a fresh module.
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ slugs: SLUGS })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lets the Featured Round's Sessions through", async () => {
    const res = await run("/f1/telemetry/qualifying");
    expect(res.status).toBe(200);
    expect(rewrittenTo(res)).toBeNull();
  });

  it("answers any other slug with a real 404", async () => {
    const res = await run("/f1/telemetry/nope");
    expect(res.status).toBe(404);
    expect(rewrittenTo(res)).toContain("/_not-found");
  });

  it("answers other Series with a 404 without asking for the list", async () => {
    const res = await run("/f2/telemetry/race");
    expect(res.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads the list once a minute, not per request", async () => {
    const { proxy } = await import("./proxy");
    await proxy(new NextRequest("https://motorsportsinfo.app/f1/telemetry/race"));
    await proxy(new NextRequest("https://motorsportsinfo.app/f1/telemetry/nope"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0].toString()).toBe("https://motorsportsinfo.app/api/telemetry-sessions");
  });

  it("leaves the page to decide when the list can't be had", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Unauthorized", { status: 401 })),
    );
    const res = await run("/f1/telemetry/nope");
    expect(res.status).toBe(200);
    expect(rewrittenTo(res)).toBeNull();
  });
});
