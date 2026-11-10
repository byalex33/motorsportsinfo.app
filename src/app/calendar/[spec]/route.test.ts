import { beforeEach, describe, expect, it, vi } from "vitest";

const buildCalendarFeed = vi.fn();

vi.mock("@/server/alerts/feed", () => ({ buildCalendarFeed }));

const { GET } = await import("./route");

/** `spec` as the router hands it over: already percent-decoded. */
function get(spec: string) {
  return GET(new Request(`https://motorsportsinfo.app/calendar/${encodeURIComponent(spec)}`), {
    params: Promise.resolve({ spec }),
  });
}

describe("GET /calendar/[spec]", () => {
  beforeEach(() => {
    buildCalendarFeed.mockReset();
    buildCalendarFeed.mockResolvedValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
  });

  it("serves the feed for a valid selection", async () => {
    const res = await get("f1-q-r.ics");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(buildCalendarFeed).toHaveBeenCalledWith({ f1: ["qualifying", "race"] });
  });

  // One selection, one URL: otherwise every spelling is its own CDN entry and feed build.
  it.each(["f1-r-q.ics", "f1-q-r"])("redirects another spelling of the selection to the canonical feed: %s", async (spec) => {
    const res = await get(spec);
    expect(res.status).toBe(308);
    expect(res.headers.get("Location")).toBe("/calendar/f1-q-r.ics");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400");
    expect(buildCalendarFeed).not.toHaveBeenCalled();
  });

  it("caches the 404 for an unknown feed briefly", async () => {
    const res = await get("nope.ics");
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=300");
  });

  // /calendar/f1-q%25.ics arrives as "f1-q%.ics"; decoding it a second time used to throw a URIError (500).
  it.each(["f1-q%.ics", "%E0%A4%A.ics"])("answers 404 for a stray percent sign: %s", async (spec) => {
    const res = await get(spec);
    expect(res.status).toBe(404);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(buildCalendarFeed).not.toHaveBeenCalled();
  });
});
