// What a Telemetry page (and its share image) shows, worked out once from the route and the query:
// ?a=VER&b=LEC picks the drivers (default: the top two), ?ca=ff00aa&cb=… the colours (default: team colours),
// ?ch=throttle the car data shown (default: speed).
import { connection } from "next/server";
import type { LapComparison, Round, Session, TelemetryDriver, TelemetryLap } from "@/domain/types";
import { sessionSlug } from "@/lib/session-slug";
import { chosenPalette, colorParam, type TeamPalette } from "@/lib/team-colors";
import { channelParam, type TelemetryChannel } from "@/lib/telemetry-channels";
import { fastestLap, getLapComparison, getSessionTelemetry } from "@/server/telemetry";
import { getSeriesPageData } from "../../data";

type Query = Record<string, string | string[] | undefined>;

export type PickerDriver = TelemetryDriver & { hasLap: boolean };

export interface ReadyComparison {
  kind: "ready";
  round: Round;
  session: Session;
  slug: string;
  drivers: PickerDriver[];
  a: PickerDriver;
  b: PickerDriver;
  lapsA: TelemetryLap[];
  lapsB: TelemetryLap[];
  lapA: TelemetryLap;
  lapB: TelemetryLap;
  /** null when OpenF1 has no car data for one of the laps yet. */
  comparison: LapComparison | null;
  /** Compared laps well off the Session's best (a red flag, a crash): not like for like. */
  offPace: { driver: PickerDriver; lap: TelemetryLap }[];
  palette: TeamPalette;
  /** The viewer's colour picks from the query, or null for the team colour. */
  picks: { a: string | null; b: string | null };
  channel: TelemetryChannel;
}

type Found = { round: Round; session: Session; slug: string };

export type TelemetryView =
  | { kind: "not-found" }
  | ({ kind: "not-finished" } & Found)
  | ({ kind: "unavailable" } & Found)
  | ({ kind: "too-few" } & Found)
  | ReadyComparison;

/** The Featured Round's Session behind a Telemetry URL, or null. */
export async function findTelemetrySession(seriesParam: string, slug: string): Promise<{ round: Round; session: Session } | null> {
  if (seriesParam !== "f1") return null;
  const { featured } = await getSeriesPageData("f1");
  if (featured.kind !== "round") return null;
  const session = featured.sessions.find((s) => sessionSlug(s) === slug && s.status !== "cancelled");
  return session ? { round: featured.round, session } : null;
}

export async function resolveTelemetry(seriesParam: string, slug: string, query: Query): Promise<TelemetryView> {
  const found = await findTelemetrySession(seriesParam, slug);
  if (!found) return { kind: "not-found" };
  const { round, session } = found;
  if (!(await hasFinished(session.endsAt))) return { kind: "not-finished", round, session, slug };

  const result = await getSessionTelemetry(round.season, session);
  if (result.kind === "unavailable") return { kind: "unavailable", round, session, slug };

  const { telemetry, sessionKey } = result;
  const drivers = telemetry.drivers.map((d) => ({ ...d, hasLap: fastestLap(telemetry.laps[d.number] ?? []) !== null }));
  const comparable = drivers.filter((d) => d.hasLap);
  if (comparable.length < 2) return { kind: "too-few", round, session, slug };

  const byCode = (value: Query[string]) => comparable.find((d) => d.code === String(value ?? "").toUpperCase());
  const a = byCode(query.a) ?? comparable[0];
  const b = [byCode(query.b), ...comparable].find((d) => d && d.number !== a.number)!;
  const lapsA = telemetry.laps[a.number] ?? [];
  const lapsB = telemetry.laps[b.number] ?? [];
  const lapA = fastestLap(lapsA)!;
  const lapB = fastestLap(lapsB)!;
  const comparison = await getLapComparison(sessionKey, { driver: a.number, lap: lapA }, { driver: b.number, lap: lapB });

  const sessionBest = Math.min(...comparable.map((d) => fastestLap(telemetry.laps[d.number] ?? [])!.time!));
  const offPace = [
    { driver: a, lap: lapA },
    { driver: b, lap: lapB },
  ].filter(({ lap }) => lap.time! > sessionBest * 1.07);

  const picks = { a: colorParam(query.ca), b: colorParam(query.cb) };
  const palette = chosenPalette(a.color, b.color, picks.a, picks.b);
  const channel = channelParam(query.ch);
  return { kind: "ready", round, session, slug, drivers, a, b, lapsA, lapsB, lapA, lapB, comparison, offPace, palette, picks, channel };
}

/** Read per request, so a Session that just finished shows straight away. */
async function hasFinished(endsAt: string): Promise<boolean> {
  await connection();
  return Date.parse(endsAt) <= Date.now();
}
