// GET /documents/{file}.pdf, from older links: redirects to the FIA's PDF on fia.com. The site no longer
// relays the PDFs (ADR 0001); only a bare PDF file name in the FIA's decision-document folder is redirected.
import { fiaDocumentSource } from "@/server/documents";

export async function GET(_request: Request, ctx: RouteContext<"/documents/[file]">) {
  const { file } = await ctx.params;
  let name: string;
  try {
    name = decodeURIComponent(file);
  } catch {
    name = file;
  }
  const source = fiaDocumentSource(name);
  if (!source) {
    return new Response("No such FIA document.\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
    });
  }
  return new Response(null, {
    status: 308,
    headers: { Location: source, "Cache-Control": "public, max-age=86400, s-maxage=86400", "X-Robots-Tag": "noindex" },
  });
}
