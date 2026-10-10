// Telemetry draws each driver in their team's colour. Raw team colours don't always work on our surfaces
// (Cadillac's grey vanishes on white, Williams' blue on black) and often clash (teammates share one; Audi and
// Ferrari, or Cadillac and Haas, are near twins). So each colour keeps its hue but has its lightness fitted
// to each theme, and when the pair is still too alike, driver B moves to a clearly lighter or darker shade
// and is drawn dashed. Maths in OKLab, where distances match what people see.

export interface ThemedColor {
  light: string;
  dark: string;
}

export interface TeamPalette {
  a: ThemedColor;
  b: ThemedColor;
  /** The two colours are too alike to tell apart by colour alone, so driver B is also drawn dashed. */
  dashedB: boolean;
}

/** Lightness that reads at 3:1 or better against our light (#ffffff) and dark (#0a0a0a) surfaces. */
const BAND = { light: [0.36, 0.6], dark: [0.62, 0.86] } as const;
/** Where driver B may go when it has to step away from A; still readable on that surface. */
const STEP_RANGE = { light: [0.22, 0.62], dark: [0.55, 0.95] } as const;
/** OKLab distance below which two colours count as the same. */
const MIN_DISTANCE = 0.12;
const STEP = 0.2;

/** The default categorical pair (blue, orange), for drivers without a team colour. */
const FALLBACK: TeamPalette = {
  a: { light: "#2a78d6", dark: "#3987e5" },
  b: { light: "#eb6834", dark: "#d95926" },
  dashedB: false,
};

/** Colours for drivers A and B from their team colours ("4781D7" or "#4781D7"). */
export function teamPalette(teamA: string | null, teamB: string | null): TeamPalette {
  const labA = teamA ? parseHex(teamA) : null;
  const labB = teamB ? parseHex(teamB) : null;
  if (!labA || !labB) return FALLBACK;

  let dashedB = false;
  const out = { a: {} as ThemedColor, b: {} as ThemedColor };
  for (const mode of ["light", "dark"] as const) {
    const a = withLightness(labA, clamp(labA[0], BAND[mode][0], BAND[mode][1]));
    let b = withLightness(labB, clamp(labB[0], BAND[mode][0], BAND[mode][1]));
    if (distance(a, b) < MIN_DISTANCE) {
      dashedB = true;
      const [lo, hi] = STEP_RANGE[mode];
      // Away from A, in whichever direction has room on this surface.
      const target = a[0] + STEP <= hi ? a[0] + STEP : Math.max(lo, a[0] - STEP);
      b = withLightness(labB, target);
    }
    out.a[mode] = toHex(a);
    out.b[mode] = toHex(b);
  }
  return { ...out, dashedB };
}

/**
 * The palette with the viewer's own picks (from the colour pickers) in place of the team colours. A pick is
 * used exactly as chosen in both themes; driver B is still dashed when the two end up too alike.
 */
export function chosenPalette(teamA: string | null, teamB: string | null, pickA: string | null, pickB: string | null): TeamPalette {
  const base = teamPalette(teamA, teamB);
  if (!pickA && !pickB) return base;
  const a = pickA ? { light: pickA, dark: pickA } : base.a;
  const b = pickB ? { light: pickB, dark: pickB } : base.b;
  return { a, b, dashedB: tooAlike(a.light, b.light) || tooAlike(a.dark, b.dark) };
}

/** A colour from the query string ("e8002d", with or without #) as "#e8002d", or null. */
export function colorParam(value: unknown): string | null {
  const m = typeof value === "string" ? /^#?([0-9a-f]{6})$/i.exec(value.trim()) : null;
  return m ? `#${m[1].toLowerCase()}` : null;
}

function tooAlike(x: string, y: string): boolean {
  const p = parseHex(x);
  const q = parseHex(y);
  return !!p && !!q && distance(p, q) < MIN_DISTANCE;
}

type Lab = [l: number, a: number, b: number];

function parseHex(hex: string): Lab | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return rgbToOklab([(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255) as [number, number, number]);
}

/** The same hue at lightness `l`, with chroma eased off until it fits in sRGB. */
function withLightness([, a, b]: Lab, l: number): Lab {
  let k = 1;
  for (let i = 0; i < 30; i++) {
    const rgb = oklabToRgb([l, a * k, b * k]);
    if (rgb.every((c) => c >= -0.0005 && c <= 1.0005)) break;
    k *= 0.92;
  }
  return [l, a * k, b * k];
}

function distance(p: Lab, q: Lab): number {
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function toHex(lab: Lab): string {
  return `#${oklabToRgb(lab)
    .map((c) => Math.round(clamp(c, 0, 1) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.sign(c) * Math.abs(c) ** (1 / 2.4) - 0.055);

function rgbToOklab(rgb: [number, number, number]): Lab {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, A, B]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
