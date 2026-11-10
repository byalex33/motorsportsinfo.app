import { describe, expect, it } from "vitest";
import { getJson, getPage, HttpError, MAX_BODY_BYTES, type SourceContext } from "./http";

/** A fake fetch answering every request with `respond`. */
function context(respond: (url: string) => Response): SourceContext {
  return { sleep: async () => {}, fetch: async (url) => respond(url) };
}

/** A Response whose `url` is `finalUrl`, as fetch reports it after following redirects. */
function redirectedTo(finalUrl: string, body: string): Response {
  const res = new Response(body, { status: 200 });
  Object.defineProperty(res, "url", { value: finalUrl });
  return res;
}

describe("source requests", () => {
  it("names only the origin in an HTTP error, never the path or query", async () => {
    const url = "https://ics.example.com/private/subscriber-123/calendar.ics?token=secret";
    const error = await getPage(context(() => new Response("error", { status: 500 })), url).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(500);
    const message = (error as Error).message;
    expect(message).toBe("HTTP 500 for https://ics.example.com");
    expect(message).not.toContain("subscriber-123");
    expect(message).not.toContain("secret");
  });

  it("refuses a response that a redirect brought from another host", async () => {
    const ctx = context(() => redirectedTo("https://other.example/races/x?k=v", "<html></html>"));
    await expect(getPage(ctx, "https://supergt.net/races/round3-motegi")).rejects.toThrow(
      "https://supergt.net redirected to another host (https://other.example)",
    );
  });

  it("accepts a redirect on the same host, or between it and its www. name", async () => {
    await expect(getPage(context(() => redirectedTo("https://supergt.net/races/new", "ok")), "https://supergt.net/races/old")).resolves.toBe("ok");
    await expect(getPage(context(() => redirectedTo("https://www.fiawec.com/en", "ok")), "https://fiawec.com/en")).resolves.toBe("ok");
  });

  it("reads JSON and pages within the size limit", async () => {
    await expect(getJson(context(() => Response.json({ a: 1 })), "https://api.example.com/x")).resolves.toEqual({ a: 1 });
    await expect(getPage(context(() => new Response("é".repeat(10))), "https://example.com/")).resolves.toBe("é".repeat(10));
  });

  it("stops reading a body larger than the limit", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.length;
        controller.enqueue(chunk);
      },
    });
    const ctx = context(() => new Response(endless));
    await expect(getPage(ctx, "https://example.com/huge")).rejects.toThrow(`https://example.com body is larger than ${MAX_BODY_BYTES} bytes`);
    expect(sent).toBeLessThanOrEqual(MAX_BODY_BYTES + 2 * chunk.length);
  });

  it("refuses a body whose declared length is over the limit without reading it", async () => {
    const res = new Response("small", { headers: { "Content-Length": String(MAX_BODY_BYTES + 1) } });
    await expect(getJson(context(() => res), "https://api.example.com/x")).rejects.toThrow("larger than");
  });
});
