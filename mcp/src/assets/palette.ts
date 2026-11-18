/**
 * Color sets from color theory: one color, a harmony and a mood give a background, text,
 * accent and pattern color that belong together, with readable text guaranteed.
 *
 * The model keeps full freedom (any color, any harmony, explicit colors still win); this just
 * makes "build me a palette around this purple" come out coherent instead of copied from a table.
 */

export const HARMONIES = ['monochrome', 'analogous', 'complementary', 'triadic', 'split'] as const;
export type Harmony = typeof HARMONIES[number];
export const MOODS = ['light', 'dark', 'vivid'] as const;
export type Mood = typeof MOODS[number];

export interface Palette {
  background: string;
  text: string;
  accent: string;
  /** The pattern / gradient color: a gentle partner to the background. */
  pattern: string;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wrap = (h: number) => ((h % 360) + 360) % 360;

function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((wrap(h) / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(wrap(h) / 60);
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function luminance(hex: string): number {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Move `c`'s lightness away from `bg` until the contrast reaches `min`. */
function ensureContrast(c: Hsl, bg: string, min: number): string {
  const lighter = luminance(bg) < 0.4;
  let cur = { ...c };
  for (let i = 0; i < 40 && contrast(hslToHex(cur), bg) < min; i++) {
    cur = { ...cur, l: clamp(cur.l + (lighter ? 0.02 : -0.02), 0, 1) };
  }
  return hslToHex(cur);
}

/** Hues for (text, accent, pattern) relative to the main hue. */
function hues(h: number, harmony: Harmony): [number, number, number] {
  switch (harmony) {
    case 'monochrome':
      return [h, h, h];
    case 'complementary':
      return [h, h + 180, h];
    case 'triadic':
      return [h, h + 120, h + 240];
    case 'split':
      return [h, h + 150, h + 210];
    case 'analogous':
    default:
      return [h, h + 35, h - 35];
  }
}

export function derivePalette(
  from: string,
  harmony: Harmony = 'analogous',
  mood: Mood = 'light',
): Palette {
  const base = hexToHsl(from);
  // A grey has no hue to build on; give it a little so harmonies still mean something.
  // A grey has no hue: keep the set neutral and let only the accent bring color.
  const neutral = base.s < 0.08;
  const s = neutral ? 0.12 : base.s;
  const [htRaw, haRaw, hpRaw] = hues(base.h, harmony);
  const ht = wrap(htRaw);
  const ha = wrap(haRaw);
  // The pattern sits behind everything: half the harmony's hue shift keeps it gentle.
  const hpOffset = ((hpRaw - base.h + 540) % 360) - 180;
  const hp = wrap(base.h + hpOffset / 2);

  let background: string;
  let text: Hsl;
  let accent: Hsl;
  let pattern: Hsl;
  if (mood === 'dark') {
    background = hslToHex({ h: base.h, s: clamp(s * 0.7, 0.25, 0.6), l: 0.11 });
    text = { h: ht, s: clamp(s, 0.5, 0.85), l: 0.9 };
    accent = { h: ha, s: 0.9, l: 0.62 };
    pattern = { h: hp, s: clamp(s * 0.8, 0.3, 0.6), l: 0.2 };
  } else if (mood === 'vivid') {
    background = hslToHex({ h: base.h, s: clamp(s, 0.6, 0.85), l: 0.45 });
    text = { h: ht, s: 0.25, l: 0.97 };
    accent = { h: ha, s: 0.95, l: 0.72 };
    pattern = { h: hp, s: clamp(s, 0.6, 0.85), l: 0.53 };
  } else {
    background = hslToHex({ h: base.h, s: clamp(s * 0.85, 0.35, 0.8), l: 0.92 });
    text = { h: ht, s: clamp(s, 0.5, 0.75), l: 0.3 };
    accent = { h: ha, s: 0.78, l: 0.6 };
    pattern = { h: hp, s: clamp(s, 0.4, 0.75), l: 0.84 };
  }
  if (neutral) {
    background = hslToHex({ ...hexToHsl(background), s: 0.03 });
    text = { ...text, s: 0.04 };
    pattern = { ...pattern, s: 0.04 };
  }
  return {
    background,
    // Readable text (4.5:1) and a frame that stands out (1.8:1), whatever the inputs.
    text: ensureContrast(text, background, 4.5),
    accent: ensureContrast(accent, background, 1.8),
    pattern: hslToHex(pattern),
  };
}
