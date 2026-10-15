import { afterEach, describe, expect, it, vi } from "vitest";
import { cspReportLine, MAX_REPORT_BYTES, parseCspReports, readCappedBody } from "./report";
import { POST } from "./route";

const LEGACY = {
  "csp-report": {
    "document-uri": "https://motorsportsinfo.app/f1?utm_source=x#top",
    "effective-directive": "script-src-elem",
    "violated-directive": "script-src",
    "blocked-uri": "https://evil.example/x.js?token=secret",
    "line-number": 12,
    "script-sample": "alert(document.cookie)",
  },
};

const post = (body: string | ReadableStream<Uint8Array>, type = "application/csp-report", headers: Record<string, string> = {}) =>
  POST(new Request("https://motorsportsinfo.app/api/csp-report", { method: "POST", headers: { "Content-Type": type, ...headers }, body, duplex: "half" } as RequestInit));

afterEach(() => vi.restoreAllMocks());

describe("parseCspReports", () => {
  it("reads the report-uri shape, keeping only the directive, blocked URL, page path and line", () => {
    expect(parseCspReports(LEGACY)).toEqual([{ directive: "script-src-elem", blocked: "https://evil.example/x.js", page: "/f1", line: 12 }]);
  });

  it("falls back to the violated directive", () => {
    expect(parseCspReports({ "csp-report": { "violated-directive": "img-src", "blocked-uri": "data" } })[0]).toMatchObject({ directive: "img-src", blocked: "data" });
  });

  it("reads the Reporting API's batch, skipping other report types", () => {
    const body = [
      { type: "csp-violation", url: "https://motorsportsinfo.app/wec", body: { effectiveDirective: "connect-src", blockedURL: "https://api.example/v1?k=1", lineNumber: 3 } },
      { type: "deprecation", body: { id: "x" } },
    ];
    expect(parseCspReports(body)).toEqual([{ directive: "connect-src", blocked: "https://api.example/v1", page: "/wec", line: 3 }]);
  });

  it("keeps keywords such as inline and eval, and drops a bad line number", () => {
    expect(parseCspReports({ "csp-report": { "blocked-uri": "inline", "line-number": "12" } })[0]).toMatchObject({ blocked: "inline", line: null });
  });

  it("gives nothing for a body that isn't a report", () => {
    expect(parseCspReports(null)).toEqual([]);
    expect(parseCspReports({ hello: "world" })).toEqual([]);
    expect(parseCspReports("csp-report")).toEqual([]);
  });

  it("keeps each field on one short line", () => {
    const [report] = parseCspReports({ "csp-report": { "effective-directive": `script-src\n[csp] forged ${"x".repeat(500)}` } });
    expect(report.directive).not.toContain("\n");
    expect(report.directive.length).toBeLessThanOrEqual(200);
  });
});

describe("cspReportLine", () => {
  it("is one [csp] line", () => {
    expect(cspReportLine(parseCspReports(LEGACY)[0])).toBe("[csp] script-src-elem blocked https://evil.example/x.js on /f1 line 12");
    expect(cspReportLine({ directive: "", blocked: "", page: "", line: null })).toBe("[csp] ? blocked ? on ?");
  });
});

describe("readCappedBody", () => {
  it("stops reading a body without Content-Length once it passes the cap", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(4096));
      },
    });
    const request = new Request("https://motorsportsinfo.app/api/csp-report", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect(await readCappedBody(request)).toBeNull();
    expect(pulled).toBeLessThan(5);
  });
});

describe("POST /api/csp-report", () => {
  it("logs one line per report and answers 204", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await post(JSON.stringify(LEGACY));
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[csp] script-src-elem blocked https://evil.example/x.js on /f1 line 12");
  });

  it("accepts an empty report", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await post('{"csp-report":{}}')).status).toBe(204);
  });

  it("accepts the Reporting API's content type", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await post("[]", "application/reports+json")).status).toBe(204);
  });

  it("refuses a body over 8 KB without logging", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const big = JSON.stringify({ "csp-report": { "blocked-uri": "x".repeat(MAX_REPORT_BYTES) } });
    expect((await post(big)).status).toBe(413);
    expect((await post("{}", "application/csp-report", { "Content-Length": String(MAX_REPORT_BYTES + 1) })).status).toBe(413);
    expect(warn).not.toHaveBeenCalled();
  });

  it("refuses other content types and unreadable JSON", async () => {
    expect((await post(JSON.stringify(LEGACY), "text/plain")).status).toBe(415);
    expect((await post("{not json")).status).toBe(400);
  });
});
