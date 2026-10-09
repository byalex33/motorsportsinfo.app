// FIA Document viewer: GET /documents/{file}.pdf, e.g. /documents/2026_singapore_grand_prix_-_entry_list.pdf
// Relays the FIA's PDF inline so it opens in the browser instead of downloading (see serveFiaDocument).
import { serveFiaDocument } from "@/server/documents/viewer";

export async function GET(_request: Request, ctx: RouteContext<"/documents/[file]">) {
  const { file } = await ctx.params;
  let name: string;
  try {
    name = decodeURIComponent(file);
  } catch {
    name = file;
  }
  return serveFiaDocument(name);
}
