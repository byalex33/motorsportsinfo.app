// The share image for a Telemetry comparison: GET /f1/telemetry/{session}/image?a=VER&b=LEC[&ca=…&cb=…&ch=…].
// Used by "Copy image" and as the page's preview card on X and elsewhere. Dark, 1200×675 (X's large card),
// with a faint motorsportsinfo.app watermark. Built from the same cached data as the page.
import { ImageResponse } from "next/og";
import type { LapComparison } from "@/domain/types";
import { formatLapTime } from "@/lib/lap-time";
import { CHANNEL_LABELS, type TelemetryChannel } from "@/lib/telemetry-channels";
import { resolveTelemetry } from "../comparison";

const W = 1200;
const H = 675;
const BG = "#0a0a0a";
const FG = "#ededed";
const MUTED = "#a1a1a1";
const GRID = "#262626";

export async function GET(request: Request, ctx: RouteContext<"/[series]/telemetry/[session]/image">) {
  const { series, session: slug } = await ctx.params;
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const view = await resolveTelemetry(series, slug, query);
  if (view.kind !== "ready" || !view.comparison) return new Response("No telemetry to draw yet", { status: 404 });

  const { round, session, a, b, lapA, lapB, comparison, palette, channel } = view;
  const colorA = palette.a.dark;
  const colorB = palette.b.dark;
  const dash = palette.dashedB ? "10 6" : undefined;
  const gap = lapB.time! - lapA.time!;
  const quicker = gap >= 0 ? a.code : b.code;
  const aFaster = comparison.miniSectors.filter((m) => m.gain > 0).length;
  const fonts = await loadFonts();

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: BG, color: FG, padding: "44px 52px 36px", position: "relative", fontFamily: fonts.length ? "Geist" : undefined }}>
        {/* Watermark, faint and diagonal behind everything. */}
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 128, fontWeight: 600, letterSpacing: -5, color: "rgba(237,237,237,0.045)", transform: "rotate(-9deg)" }}>motorsportsinfo.app</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 18, letterSpacing: 3, color: MUTED, textTransform: "uppercase" }}>{`F1 · ${round.name}`}</div>
            <div style={{ fontSize: 46, fontWeight: 600, letterSpacing: -1.5, marginTop: 6 }}>{`${session.name} telemetry`}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <DriverLine color={colorA} code={a.code} time={formatLapTime(lapA.time!)} />
            <DriverLine color={colorB} code={b.code} time={formatLapTime(lapB.time!)} dashed={!!dash} />
            <div style={{ fontSize: 18, color: MUTED, marginTop: 2 }}>
              {Math.abs(gap) < 0.0005 ? "Dead level" : `${quicker} quicker by ${Math.abs(gap).toFixed(3)} s`}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, marginTop: 22, gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 770 }}>
            <Label>{channel === "speed" ? "Speed · km/h" : channel === "throttle" ? "Throttle · %" : CHANNEL_LABELS[channel]}</Label>
            <ChannelChart comparison={comparison} channel={channel} colorA={colorA} colorB={colorB} dash={dash} />
            <div style={{ display: "flex", marginTop: 14 }}>
              <Label>{`Gap · above the line ${a.code} is ahead`}</Label>
            </div>
            <GapChart comparison={comparison} colorA={colorA} colorB={colorB} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <Label>{"Who’s quicker where"}</Label>
            <TrackMap comparison={comparison} colorA={colorA} colorB={colorB} />
            <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 18, color: MUTED, marginTop: 6 }}>
              <Count color={colorA} text={`${a.code} ${aFaster}`} />
              <Count color={colorB} text={`${b.code} ${comparison.miniSectors.length - aFaster}`} />
              <span>{`of ${comparison.miniSectors.length}`}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 14 }}>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.5 }}>motorsportsinfo.app</div>
          <div style={{ fontSize: 16, color: MUTED }}>Fastest laps · Data: OpenF1</div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts,
      headers: {
        // The laps behind it are cached for hours; the CDN can hold the picture as long.
        "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
        "X-Robots-Tag": "noindex",
      },
    },
  );
}

function Label({ children }: { children: string }) {
  return <div style={{ fontSize: 15, letterSpacing: 2.5, color: MUTED, textTransform: "uppercase", marginBottom: 6 }}>{children}</div>;
}

function Count({ color, text }: { color: string; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{ width: 14, height: 5, borderRadius: 3, background: color }} />
      <div style={{ color: FG }}>{text}</div>
    </div>
  );
}

function DriverLine({ color, code, time, dashed }: { color: string; code: string; time: string; dashed?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg width={30} height={6}>
        <line x1={0} y1={3} x2={30} y2={3} stroke={color} strokeWidth={5} strokeDasharray={dashed ? "8 4" : undefined} />
      </svg>
      <div style={{ fontSize: 30, fontWeight: 600 }}>{code}</div>
      <div style={{ fontSize: 26, color: MUTED }}>{time}</div>
    </div>
  );
}

/** The channel chosen on the page (?ch=), drawn as on the page: slopes for speed and throttle, steps for brake and gear. */
function ChannelChart({
  comparison,
  channel,
  colorA,
  colorB,
  dash,
}: {
  comparison: LapComparison;
  channel: TelemetryChannel;
  colorA: string;
  colorB: string;
  dash?: string;
}) {
  // Sized so the column fits the card: label, this, label, gap chart.
  const w = 770;
  const h = 216;
  const { distance } = comparison;
  const len = distance[distance.length - 1];
  const va = comparison.a[channel];
  const vb = comparison.b[channel];
  const step = channel === "brake" || channel === "gear";
  let lo = 0;
  let hi = 100;
  let grid = [25, 50, 75];
  if (channel === "speed") {
    lo = Math.max(0, Math.floor(Math.min(...va, ...vb) / 50) * 50);
    hi = Math.ceil(Math.max(...va, ...vb) / 50) * 50;
    grid = [100, 200, 300].filter((v) => v > lo && v < hi);
  } else if (channel === "gear") {
    // 0 is neutral (a car stopped or crawling).
    lo = 0;
    hi = 8;
    grid = [2, 4, 6];
  } else if (channel === "brake") {
    grid = [];
  }
  const x = (i: number) => (distance[i] / len) * w;
  const y = (v: number) => 6 + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (h - 12);
  return (
    <svg width={w} height={h}>
      {grid.map((v) => (
        <line key={v} x1={0} x2={w} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
      ))}
      <path d={path(vb, x, y, step)} fill="none" stroke={colorB} strokeWidth={3} strokeLinejoin="round" strokeDasharray={dash} />
      <path d={path(va, x, y, step)} fill="none" stroke={colorA} strokeWidth={3} strokeLinejoin="round" />
    </svg>
  );
}

function GapChart({ comparison, colorA, colorB }: { comparison: LapComparison; colorA: string; colorB: string }) {
  const w = 770;
  const h = 108;
  const { distance, delta } = comparison;
  const len = distance[distance.length - 1];
  const m = Math.max(0.1, ...delta.map(Math.abs)) * 1.1;
  const x = (i: number) => (distance[i] / len) * w;
  const y = (v: number) => ((m - v) / (2 * m)) * h;
  const line = path(delta, x, y);
  const zero = y(0);
  // Satori has no clip paths: the area above and below the line are drawn from clamped copies of the gap.
  const above = `${path(delta.map((v) => Math.max(0, v)), x, y)}L${w},${zero}L0,${zero}Z`;
  const below = `${path(delta.map((v) => Math.min(0, v)), x, y)}L${w},${zero}L0,${zero}Z`;
  return (
    <svg width={w} height={h}>
      <path d={above} fill={colorA} fillOpacity={0.22} />
      <path d={below} fill={colorB} fillOpacity={0.22} />
      <line x1={0} x2={w} y1={zero} y2={zero} stroke={MUTED} strokeOpacity={0.5} strokeWidth={1} />
      <path d={line} fill="none" stroke={FG} strokeWidth={2.5} strokeLinejoin="round" />
    </svg>
  );
}

function TrackMap({ comparison, colorA, colorB }: { comparison: LapComparison; colorA: string; colorB: string }) {
  const size = 300;
  const { x, miniSectors } = comparison;
  if (x.length === 0) return <div style={{ display: "flex", width: size, height: size }} />;
  const y = comparison.y.map((v) => -v);
  const minX = Math.min(...x);
  const minY = Math.min(...y);
  const extent = Math.max(Math.max(...x) - minX, Math.max(...y) - minY);
  const k = (size - 24) / extent;
  const px = (i: number) => 12 + (x[i] - minX) * k;
  const py = (i: number) => 12 + (y[i] - minY) * k;
  const seg = (from: number, to: number) => {
    let d = "";
    for (let i = from; i <= to; i++) d += `${i === from ? "M" : "L"}${px(i).toFixed(1)},${py(i).toFixed(1)}`;
    return d;
  };
  return (
    <svg width={size} height={size}>
      <path d={seg(0, x.length - 1)} fill="none" stroke={GRID} strokeWidth={14} strokeLinejoin="round" />
      {miniSectors.map((m, i) => (
        <path key={i} d={seg(m.from, m.to)} fill="none" stroke={m.gain > 0 ? colorA : colorB} strokeWidth={7} strokeLinejoin="round" />
      ))}
      <circle cx={px(0)} cy={py(0)} r={7} fill={BG} stroke={FG} strokeWidth={3} />
    </svg>
  );
}

function path(values: number[], x: (i: number) => number, y: (v: number) => number, step = false): string {
  let d = "";
  for (let i = 0; i < values.length; i++) {
    const px = x(i).toFixed(1);
    const py = y(values[i]).toFixed(1);
    d += i === 0 ? `M${px},${py}` : step ? `H${px}V${py}` : `L${px},${py}`;
  }
  return d;
}

/**
 * Geist (the site's typeface) as TTF from Google Fonts, regular and semibold. Satori can't read woff2, and
 * Google serves TTF to a client that doesn't ask for anything newer. Without it the default font is used.
 */
async function loadFonts(): Promise<{ name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" }[]> {
  try {
    const css = await fetch("https://fonts.googleapis.com/css2?family=Geist:wght@400;600", {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 60 * 60 * 24 * 7 },
    }).then((r) => r.text());
    const urls = [...css.matchAll(/font-weight:\s*(\d+);[\s\S]*?src:\s*url\(([^)]+)\)/g)].map((m) => ({ weight: Number(m[1]), url: m[2] }));
    const fonts = await Promise.all(
      urls
        .filter((f) => f.weight === 400 || f.weight === 600)
        .map(async (f) => ({
          name: "Geist",
          data: await fetch(f.url, { next: { revalidate: 60 * 60 * 24 * 30 } }).then((r) => r.arrayBuffer()),
          weight: f.weight as 400 | 600,
          style: "normal" as const,
        })),
    );
    return fonts;
  } catch {
    return [];
  }
}
