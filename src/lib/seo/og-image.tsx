// Open Graph / X card artwork (1200×630), drawn with next/og in the site's flat dark style.
// Used by src/app/opengraph-image.tsx (brand card) and src/app/[series]/opengraph-image.tsx.
import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";
import type { SeriesId } from "@/domain/types";
import type { OgText } from "./og-text";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";
export const BRAND_OG_ALT =
  "motorsportsinfo.app — session times and weather for F1, F2, F3, WEC, Formula E, IndyCar, MotoGP, F1 Academy, WRC, IMSA and NASCAR";

/**
 * Series accents on a black background: the dark-mode tokens from globals.css ([data-series] under
 * .dark), with IndyCar's and MotoGP's official gradients. Keep in sync with globals.css.
 */
export const OG_SERIES_COLOURS: Record<SeriesId, { accent: string; gradient: string[] }> = {
  f1: { accent: "#f73123", gradient: ["#f73123", "#f73123"] },
  f2: { accent: "#009cde", gradient: ["#009cde", "#009cde"] },
  f3: { accent: "#e35205", gradient: ["#e35205", "#e35205"] },
  wec: { accent: "#00b9ff", gradient: ["#00b9ff", "#00b9ff"] },
  fe: { accent: "#8269ff", gradient: ["#8269ff", "#8269ff"] },
  indycar: { accent: "#459aa1", gradient: ["#eb5629", "#ee8231", "#f2a83b", "#459aa1", "#388083"] },
  motogp: { accent: "#ef4031", gradient: ["#c80502", "#c80502", "#faec25"] },
  "f1-academy": { accent: "#ff3ec9", gradient: ["#6a00eb", "#ff3ec9"] },
  wrc: { accent: "#ff2a5c", gradient: ["#ff2a5c", "#ff2a5c"] },
  imsa: { accent: "#f04048", gradient: ["#f04048", "#f04048"] },
  nascar: { accent: "#2a9be0", gradient: ["#ffd659", "#e4002b", "#007ac2"] },
};

/** The Deep Purple primary in dark mode (--primary under .dark, oklch(0.608 0.217 297) ≈ #8b5cf6). */
const BRAND = { accent: "#8b5cf6", gradient: ["#7c3aed", "#8b5cf6"] };

const BG = "#0a0a0a";
const FG = "#ededed";
const MUTED = "#a1a1a1";
const BORDER = "#262626";

// --- Fonts -------------------------------------------------------------------------------------
// Geist (the site's font) from Google Fonts as TTF, which next/og can read. Cached for good; if the
// fetch fails the image still renders in next/og's bundled Geist Regular.

const FONT_CSS = "https://fonts.googleapis.com/css2?family=Geist:wght@400;600&family=Geist+Mono:wght@500";

async function loadFontsBase64(): Promise<{ name: string; weight: 400 | 500 | 600; data: string }[]> {
  "use cache";
  cacheLife("max");
  try {
    // A plain user agent gets TrueType URLs (browsers get WOFF2, which next/og cannot read).
    const css = await (await fetch(FONT_CSS, { headers: { "User-Agent": "msi-og" } })).text();
    const faces = [...css.matchAll(/font-family:\s*'([^']+)';[^}]*?font-weight:\s*(\d+);[^}]*?src:\s*url\(([^)]+)\)/g)];
    const fonts = await Promise.all(
      faces.map(async ([, name, weight, url]) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`font ${url}: ${res.status}`);
        return { name, weight: Number(weight) as 400 | 500 | 600, data: Buffer.from(await res.arrayBuffer()).toString("base64") };
      }),
    );
    return fonts;
  } catch (error) {
    console.warn(`[og] Geist fonts unavailable, using the default font: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function loadFonts() {
  const fonts = await loadFontsBase64();
  return fonts.map((f) => ({ name: f.name, weight: f.weight, style: "normal" as const, data: Buffer.from(f.data, "base64") }));
}

// --- Pieces ------------------------------------------------------------------------------------

/** The site glyph (see BrandMark): a stopwatch with a chequered quarter. */
function Mark({ size, colour }: { size: number; colour: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="26" y="4" width="12" height="6" rx="2" fill={colour} />
      <rect x="30" y="9" width="4" height="7" fill={colour} />
      <rect x="47" y="14" width="6" height="8" rx="2" transform="rotate(45 50 18)" fill={colour} />
      <circle cx="32" cy="37" r="22" stroke={colour} strokeWidth="5" />
      <defs>
        <clipPath id="q">
          <path d="M32 37 V20 A17 17 0 0 1 49 37 Z" />
        </clipPath>
      </defs>
      <path
        clipPath="url(#q)"
        d="M32 20h4.25v4.25H32zM40.5 20h4.25v4.25H40.5zM36.25 24.25h4.25v4.25h-4.25zM44.75 24.25H49v4.25h-4.25zM32 28.5h4.25v4.25H32zM40.5 28.5h4.25v4.25H40.5zM36.25 32.75h4.25V37h-4.25zM44.75 32.75H49V37h-4.25z"
        fill={colour}
      />
      <path d="M32 37 L22 27" stroke={colour} strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="37" r="3.5" fill={colour} />
    </svg>
  );
}

function gradientCss(stops: string[]) {
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function Frame({ gradient, children, footerRight }: { gradient: string[]; children: React.ReactNode; footerRight: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: BG,
        color: FG,
        fontFamily: "Geist",
      }}
    >
      <div style={{ display: "flex", height: 12, width: "100%", backgroundImage: gradientCss(gradient) }} />
      <div style={{ display: "flex", flex: 1, flexDirection: "column", padding: "64px 72px 0" }}>{children}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          margin: "0 72px",
          padding: "28px 0 40px",
          borderTop: `1px solid ${BORDER}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Mark size={40} colour={FG} />
          <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>motorsportsinfo.app</span>
        </div>
        <span style={{ fontFamily: "Geist Mono", fontSize: 20, color: MUTED, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {footerRight}
        </span>
      </div>
    </div>
  );
}

function Eyebrow({ text, gradient }: { text: string; gradient: string[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ display: "flex", width: 16, height: 16, borderRadius: 999, backgroundImage: gradientCss(gradient) }} />
      <span style={{ fontFamily: "Geist Mono", fontSize: 26, color: MUTED, letterSpacing: "0.12em", textTransform: "uppercase" }}>{text}</span>
    </div>
  );
}

// --- Cards -------------------------------------------------------------------------------------

/** A Series page's card: Featured Round, Circuit and dates, and the next Session in UTC. */
export async function seriesOgImage(series: SeriesId, text: OgText): Promise<ImageResponse> {
  const { accent, gradient } = OG_SERIES_COLOURS[series];
  const [label, ...rest] = text.status?.split(": ") ?? [];
  const detail = rest.join(": ");
  const titleSize = text.title.length > 34 ? 72 : text.title.length > 22 ? 84 : 96;

  return new ImageResponse(
    (
      <Frame gradient={gradient} footerRight="Session times · Weather">
        <Eyebrow text={text.eyebrow} gradient={gradient} />
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: titleSize,
            fontWeight: 600,
            lineHeight: 1.02,
            letterSpacing: "-0.045em",
            maxWidth: 1056,
          }}
        >
          {text.title}
        </div>
        {text.meta && <div style={{ display: "flex", marginTop: 24, fontSize: 32, color: MUTED, maxWidth: 1056 }}>{text.meta}</div>}
        {text.status && (
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: "auto", marginBottom: 36 }}>
            {detail ? (
              <>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    height: 40,
                    padding: "0 14px",
                    borderRadius: 6,
                    border: `2px solid ${accent}`,
                    color: accent,
                    fontFamily: "Geist Mono",
                    fontSize: 22,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </span>
                <span style={{ fontSize: 34, fontWeight: 600 }}>{detail}</span>
              </>
            ) : (
              <span style={{ fontSize: 34, fontWeight: 600 }}>{text.status}</span>
            )}
          </div>
        )}
      </Frame>
    ),
    { ...OG_SIZE, fonts: await loadFonts() },
  );
}

/** The site's own card for the home, About and Alerts pages. */
export async function brandOgImage(): Promise<ImageResponse> {
  return new ImageResponse(
    (
      <Frame gradient={BRAND.gradient} footerRight="Free · No ads · No accounts">
        <Eyebrow text="F1 · F2 · F3 · WEC · Formula E · IndyCar · MotoGP" gradient={BRAND.gradient} />
        <div style={{ display: "flex", marginTop: 28, fontSize: 80, fontWeight: 600, lineHeight: 1.04, letterSpacing: "-0.045em", maxWidth: 1056 }}>
          Session times & weather, in your time zone
        </div>
        <div style={{ display: "flex", marginTop: 24, fontSize: 30, color: MUTED, maxWidth: 1000, lineHeight: 1.35 }}>
          Every Session of the next Round, a live countdown, the forecast at the Circuit and rain radar.
        </div>
      </Frame>
    ),
    { ...OG_SIZE, fonts: await loadFonts() },
  );
}
