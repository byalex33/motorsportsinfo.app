// POST /api/csp-report ← Content Security Policy violation reports from browsers (report-uri in next.config.ts).
// Each report is logged as one "[csp] …" line (Vercel runtime logs), so the policy can be enforced once
// they're clean. 204 when read, 413 past 8 KB, 415 for anything that isn't a report.
import { cspReportLine, parseCspReports, readCappedBody } from "./report";

const REPORT_TYPES = /^application\/(csp-report|reports\+json|json)\b/i;

export async function POST(request: Request) {
  if (!REPORT_TYPES.test(request.headers.get("content-type") ?? "")) return reply(415);
  const body = await readCappedBody(request);
  if (body === null) return reply(413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return reply(400);
  }
  for (const report of parseCspReports(parsed)) console.warn(cspReportLine(report));
  return reply(204);
}

function reply(status: number) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}
