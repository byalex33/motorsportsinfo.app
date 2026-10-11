import { describe, expect, it, vi } from "vitest";
import { checkFiaDocument, FIA_DOCUMENT_FOLDER, fiaDocumentFile, fiaDocumentFileFromSlug, fiaDocumentSource, serveFiaDocument } from "./viewer";

const FILE = "2026_singapore_grand_prix_-_provisional_sprint_starting_grid.pdf";
const SOURCE = FIA_DOCUMENT_FOLDER + FILE;

describe("fiaDocumentFile", () => {
  it("reads the file name of a PDF in the FIA's decision-document folder", () => {
    expect(fiaDocumentFile(SOURCE)).toBe(FILE);
    expect(fiaDocumentFile(`${FIA_DOCUMENT_FOLDER}2026_s%C3%A3o_paulo_-_entry_list.pdf`)).toBe("2026_são_paulo_-_entry_list.pdf");
  });

  it.each([
    ["another host", `https://evil.example/system/files/decision-document/${FILE}`],
    ["another folder", `https://www.fia.com/system/files/other/${FILE}`],
    ["a subfolder", `${FIA_DOCUMENT_FOLDER}2026/${FILE}`],
    ["an encoded slash", `${FIA_DOCUMENT_FOLDER}..%2Fsecret.pdf`],
    ["not a PDF", `${FIA_DOCUMENT_FOLDER}notes.docx`],
    ["not a URL", "Doc 33"],
  ])("refuses %s", (_, url) => {
    expect(fiaDocumentFile(url)).toBeNull();
  });
});

describe("fiaDocumentFileFromSlug", () => {
  it("adds the extension back, decoding the slug if it is still encoded", () => {
    expect(fiaDocumentFileFromSlug(FILE.replace(".pdf", ""))).toBe(FILE);
    expect(fiaDocumentFileFromSlug("2026_s%C3%A3o_paulo_-_entry_list")).toBe("2026_são_paulo_-_entry_list.pdf");
    expect(fiaDocumentFileFromSlug("2026_são_paulo_-_entry_list")).toBe("2026_são_paulo_-_entry_list.pdf");
  });

  it("refuses anything that is not a bare file name", () => {
    expect(fiaDocumentFileFromSlug("..%2Fsecret")).toBeNull();
    expect(fiaDocumentFileFromSlug("a/b")).toBeNull();
    expect(fiaDocumentFileFromSlug("")).toBeNull();
  });
});

describe("fiaDocumentSource", () => {
  it("only accepts a bare PDF file name", () => {
    expect(fiaDocumentSource(FILE)).toBe(SOURCE);
    expect(fiaDocumentSource("../x.pdf")).toBeNull();
    expect(fiaDocumentSource("a/b.pdf")).toBeNull();
    expect(fiaDocumentSource("a\\b.pdf")).toBeNull();
    expect(fiaDocumentSource(".pdf")).toBeNull();
    expect(fiaDocumentSource("x.pdf?y=1")).toBeNull();
    expect(fiaDocumentSource("x.html")).toBeNull();
  });
});

describe("serveFiaDocument", () => {
  const pdf = (headers: Record<string, string> = {}, status = 200) =>
    vi.fn(async () => new Response("%PDF-1.7 …", { status, headers: { "Content-Type": "application/pdf", ...headers } }));

  it("relays the PDF inline under the FIA's download name", async () => {
    const fetcher = pdf({
      "Content-Length": "10",
      "Content-Disposition": "attachment; filename=2026 Singapore Grand Prix - Provisional Sprint Starting Grid.pdf",
    });
    const res = await serveFiaDocument(FILE, fetcher);
    expect(fetcher).toHaveBeenCalledWith(SOURCE, expect.anything());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      `inline; filename="2026 Singapore Grand Prix - Provisional Sprint Starting Grid.pdf"; filename*=UTF-8''2026%20Singapore%20Grand%20Prix%20-%20Provisional%20Sprint%20Starting%20Grid.pdf`,
    );
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(res.headers.get("Cache-Control")).toMatch(/s-maxage=/);
    expect(await res.text()).toBe("%PDF-1.7 …");
  });

  it("gives a non-ASCII name an ASCII fallback", async () => {
    const res = await serveFiaDocument(FILE, pdf({ "Content-Disposition": "attachment; filename=São Paulo.pdf" }));
    expect(res.headers.get("Content-Disposition")).toBe(`inline; filename="S_o Paulo.pdf"; filename*=UTF-8''S%C3%A3o%20Paulo.pdf`);
  });

  it("falls back to the file name without a usable download name", async () => {
    const res = await serveFiaDocument(FILE, pdf());
    expect(res.headers.get("Content-Disposition")).toContain(`filename="${FILE}"`);
  });

  it("returns 404 for a bad file name without fetching", async () => {
    const fetcher = pdf();
    expect((await serveFiaDocument("../../etc/passwd.pdf", fetcher)).status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns 404 when the FIA has no such file", async () => {
    expect((await serveFiaDocument(FILE, pdf({}, 404))).status).toBe(404);
  });

  it.each([
    ["an HTTP error", pdf({}, 503)],
    ["a page instead of a PDF", vi.fn(async () => new Response("<html>", { headers: { "Content-Type": "text/html" } }))],
    ["a very large file", pdf({ "Content-Length": String(100 * 1024 * 1024) })],
    ["a network failure", vi.fn(async () => Promise.reject(new Error("ECONNRESET")))],
  ])("sends the viewer to fia.com on %s", async (_, fetcher) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await serveFiaDocument(FILE, fetcher);
    warn.mockRestore();
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(SOURCE);
  });
});

describe("checkFiaDocument", () => {
  const status = (code: number) => vi.fn(async () => new Response(null, { status: code }));

  it("asks fia.com for the headers only", async () => {
    const fetcher = status(200);
    expect(await checkFiaDocument(FILE, fetcher)).toBe("found");
    expect(fetcher).toHaveBeenCalledWith(SOURCE, expect.objectContaining({ method: "HEAD" }));
  });

  it("is missing only when fia.com says so", async () => {
    expect(await checkFiaDocument(FILE, status(404))).toBe("missing");
    expect(await checkFiaDocument(FILE, status(410))).toBe("missing");
    expect(await checkFiaDocument("../x.pdf", status(200))).toBe("missing");
    expect(await checkFiaDocument(FILE, status(503))).toBe("unknown");
    expect(await checkFiaDocument(FILE, vi.fn(async () => Promise.reject(new Error("ECONNRESET"))))).toBe("unknown");
  });
});
