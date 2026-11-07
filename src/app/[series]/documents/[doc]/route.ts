// A link to one FIA Document: GET /f1/documents/singapore-grand-prix-73 redirects to the FIA's PDF on fia.com.
// The site never fetches or relays the PDFs (ADR 0001). The link is addressed by Round and number so the URL
// never spells out a spoiler, as the PDF's file name can; the document list and Document Alerts use it. An
// unknown link goes to the Series' documents page on fia.com instead.
import { isSeriesId } from "@/lib/series-id";
import { fiaDocumentLink, fiaDocumentsUrl, hasFiaDocuments } from "@/server/documents";

const notFound = () =>
  new Response("No such FIA document.\n", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });

function redirect(location: string, maxAge: number): Response {
  return new Response(null, {
    status: 307,
    headers: { Location: location, "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}`, "X-Robots-Tag": "noindex" },
  });
}

export async function GET(_request: Request, ctx: RouteContext<"/[series]/documents/[doc]">) {
  const { series, doc } = await ctx.params;
  if (!isSeriesId(series) || !hasFiaDocuments(series)) return notFound();
  const target = await fiaDocumentLink(series, doc);
  // The Round and number a link names never change file, so a found one is cached for a day.
  return target ? redirect(target, 86_400) : redirect(fiaDocumentsUrl(series)!, 300);
}
