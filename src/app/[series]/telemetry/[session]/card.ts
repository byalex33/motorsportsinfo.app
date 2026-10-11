// Which preview card a Telemetry link gets. The comparison image shows lap times and who was quicker, so only
// a link that names both drivers (what the share buttons post) gets it. A bare link, pasted from the address
// bar or reached from the TELEMETRY chip, would otherwise give the result away to everyone in a chat before
// they choose to look.
import { colorParam } from "@/lib/team-colors";
import { channelParam } from "@/lib/telemetry-channels";

type Query = Record<string, string | string[] | undefined>;

/** The share image's query for a link that names both drivers (?a=VER&b=LEC, with its colours and channel), else null. */
export function comparisonCardQuery(query: Query): URLSearchParams | null {
  const [a, b] = [query.a, query.b];
  if (!isDriverCode(a) || !isDriverCode(b)) return null;
  const card = new URLSearchParams({ a, b });
  for (const key of ["ca", "cb"] as const) {
    const color = colorParam(query[key]);
    if (color) card.set(key, color.slice(1));
  }
  const channel = channelParam(query.ch);
  if (channel !== "speed") card.set("ch", channel);
  return card;
}

function isDriverCode(value: Query[string]): value is string {
  return typeof value === "string" && /^[a-z]{3}$/i.test(value);
}
