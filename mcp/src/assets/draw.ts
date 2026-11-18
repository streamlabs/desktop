/**
 * Procedural images for scenes: pattern backgrounds, webcam masks and webcam frames.
 *
 * Plain math per pixel (signed distance functions, with one pixel of soft edge so shapes are
 * smooth), no image library and no AI. The model only chooses parameters; every combination
 * draws a valid image.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const PATTERNS = [
  'gradient',
  'dots',
  'stripes',
  'checker',
  'grid',
  'hearts',
  'stars',
  'sparkles',
] as const;
export type Pattern = typeof PATTERNS[number];

export type WebcamShape = 'rounded' | 'circle';

class Image {
  readonly data: Uint8Array;
  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8Array(width * height * 4);
  }

  fill(c: Rgb, alpha = 255): void {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = c.r;
      this.data[i + 1] = c.g;
      this.data[i + 2] = c.b;
      this.data[i + 3] = alpha;
    }
  }

  /** Paint `c` over the pixel with coverage 0..1 (source-over). */
  blend(x: number, y: number, c: Rgb, coverage: number): void {
    if (coverage <= 0) return;
    const i = (y * this.width + x) * 4;
    const a = Math.min(1, coverage);
    const da = this.data[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    const mixc = (src: number, dst: number) => (src * a + dst * da * (1 - a)) / oa;
    this.data[i] = Math.round(mixc(c.r, this.data[i]));
    this.data[i + 1] = Math.round(mixc(c.g, this.data[i + 1]));
    this.data[i + 2] = Math.round(mixc(c.b, this.data[i + 2]));
    this.data[i + 3] = Math.round(oa * 255);
  }
}

// ------------------------------------------------------------------ distance functions

/** Coverage of a shape from its signed distance in pixels (negative = inside). */
const cover = (d: number) => Math.max(0, Math.min(1, 0.5 - d));

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => ({
  r: Math.round(a.r + (b.r - a.r) * t),
  g: Math.round(a.g + (b.g - a.g) * t),
  b: Math.round(a.b + (b.b - a.b) * t),
});

/** Rounded rectangle centered on the origin, half size (hx, hy), corner radius r. */
function sdRoundRect(px: number, py: number, hx: number, hy: number, r: number): number {
  const qx = Math.abs(px) - (hx - r);
  const qy = Math.abs(py) - (hy - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Heart (Inigo Quilez), unit size, tip at the origin, y up. Returns distance in heart units. */
function sdHeart(x: number, y: number): number {
  x = Math.abs(x);
  if (y + x > 1) return Math.hypot(x - 0.25, y - 0.75) - Math.SQRT2 / 4;
  const m = 0.5 * Math.max(x + y, 0);
  return (
    Math.sqrt(Math.min(Math.hypot(x, y - 1) ** 2, Math.hypot(x - m, y - m) ** 2)) * Math.sign(x - y)
  );
}

/** Five-point star (Inigo Quilez), outer radius r, y up. */
function sdStar5(x: number, y: number, r: number, rf: number): number {
  const k1x = 0.809016994375;
  const k1y = -0.587785252292;
  const k2x = -k1x;
  const k2y = k1y;
  x = Math.abs(x);
  let d = Math.max(k1x * x + k1y * y, 0);
  x -= 2 * d * k1x;
  y -= 2 * d * k1y;
  d = Math.max(k2x * x + k2y * y, 0);
  x -= 2 * d * k2x;
  y -= 2 * d * k2y;
  x = Math.abs(x);
  y -= r;
  const bax = rf * -k1y;
  const bay = rf * k1x - 1;
  const h = Math.max(0, Math.min(r, (x * bax + y * bay) / (bax * bax + bay * bay)));
  return Math.hypot(x - bax * h, y - bay * h) * Math.sign(y * bax - x * bay);
}

/** Four-point sparkle, radius r: an astroid-like curve, distance approximated in pixels. */
function sdSparkle(x: number, y: number, r: number): number {
  const f = Math.sqrt(Math.abs(x) / r) + Math.sqrt(Math.abs(y) / r) - 1;
  return f * r * 0.35;
}

/** Deterministic 0..1 noise for a grid cell, so a pattern draws the same every time. */
function hash(ix: number, iy: number, salt = 0): number {
  let h = (ix * 374761393 + iy * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

// ------------------------------------------------------------------ backgrounds

/**
 * A full-canvas background: `base` everywhere, `ink` for the pattern (or the second color of
 * a gradient). Sizes scale with the canvas so 720p and 1080p look the same.
 */
export function drawBackground(
  width: number,
  height: number,
  pattern: Pattern,
  base: Rgb,
  ink: Rgb,
): { width: number; height: number; data: Uint8Array } {
  const img = new Image(width, height);
  const u = height / 720; // pattern unit
  if (pattern === 'gradient') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = (x / width) * 0.55 + (y / height) * 0.45;
        const c = mixRgb(base, ink, t * t * (3 - 2 * t));
        const i = (y * width + x) * 4;
        img.data[i] = c.r;
        img.data[i + 1] = c.g;
        img.data[i + 2] = c.b;
        img.data[i + 3] = 255;
      }
    }
    return img;
  }

  img.fill(base);
  const s = Math.round(
    { dots: 56, stripes: 56, checker: 80, grid: 48, hearts: 110, stars: 110, sparkles: 90 }[
      pattern
    ] * u,
  );

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let d = 1e9;
      switch (pattern) {
        case 'dots': {
          const row = Math.floor(y / s);
          const off = (row % 2) * (s / 2);
          const cx = Math.floor((x - off) / s) * s + off + s / 2;
          const cy = row * s + s / 2;
          d = Math.hypot(x - cx, y - cy) - 6.5 * u;
          break;
        }
        case 'stripes': {
          const p = (((x + y) % s) + s) % s; // diagonal
          d = Math.abs(p - s / 2) - s * 0.18;
          break;
        }
        case 'checker': {
          const on = (Math.floor(x / s) + Math.floor(y / s)) % 2 === 0;
          img.blend(x, y, ink, on ? 1 : 0);
          continue;
        }
        case 'grid': {
          const gx = Math.abs((x % s) - s / 2);
          const gy = Math.abs((y % s) - s / 2);
          d = s / 2 - Math.max(gx, gy) - 1 * u; // thin lines on the cell edges
          break;
        }
        case 'hearts':
        case 'stars': {
          const row = Math.floor(y / s);
          const off = (row % 2) * (s / 2);
          const col = Math.floor((x - off) / s);
          const cx = col * s + off + s / 2;
          const cy = row * s + s / 2;
          const size = 24 * u;
          if (pattern === 'hearts') {
            // Tip at the bottom, centered in the cell; tilt alternates for a hand-placed look.
            const tilt = (hash(col, row) - 0.5) * 0.5;
            const lx = x - cx;
            const ly = cy - y + size * 0.5;
            const rx = lx * Math.cos(tilt) - ly * Math.sin(tilt);
            const ry = lx * Math.sin(tilt) + ly * Math.cos(tilt);
            d = sdHeart(rx / size, ry / size) * size;
          } else {
            d = sdStar5(x - cx, cy - y, size * 0.85, 0.45);
          }
          break;
        }
        case 'sparkles': {
          const col = Math.floor(x / s);
          const row = Math.floor(y / s);
          // Check this cell and its neighbours (sparkles are jittered across cell edges).
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const ix = col + ox;
              const iy = row + oy;
              if (hash(ix, iy, 1) < 0.45) continue;
              const cx = (ix + 0.2 + 0.6 * hash(ix, iy, 2)) * s;
              const cy = (iy + 0.2 + 0.6 * hash(ix, iy, 3)) * s;
              const r = (10 + 14 * hash(ix, iy, 4)) * u;
              d = Math.min(d, sdSparkle(x - cx, y - cy, r));
            }
          }
          break;
        }
      }
      img.blend(x, y, ink, cover(d));
    }
  }
  return img;
}

// ------------------------------------------------------------------ webcam shape

/**
 * Alpha mask for a webcam source of `width` x `height`: opaque where the camera shows. A
 * circle is centered with the source's height as diameter (the scene item is cropped to a
 * square to match).
 */
export function drawMask(width: number, height: number, shape: WebcamShape) {
  const img = new Image(width, height);
  const white = { r: 255, g: 255, b: 255 };
  const r = shape === 'circle' ? height / 2 : Math.round(height * 0.12);
  const hx = shape === 'circle' ? height / 2 : width / 2;
  const hy = height / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      img.blend(x, y, white, cover(sdRoundRect(x + 0.5 - width / 2, y + 0.5 - hy, hx, hy, r)));
    }
  }
  return img;
}

/**
 * The frame around a shaped webcam whose visible area on the canvas is `innerW` x `innerH`:
 * a ring `thickness` wide, matching the mask's corners. The image is (inner + 2*thickness).
 */
export function drawRing(
  innerW: number,
  innerH: number,
  shape: WebcamShape,
  thickness: number,
  color: Rgb,
) {
  const w = Math.round(innerW + 2 * thickness);
  const h = Math.round(innerH + 2 * thickness);
  const img = new Image(w, h);
  const r = shape === 'circle' ? innerH / 2 : Math.round(innerH * 0.12);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - w / 2;
      const py = y + 0.5 - h / 2;
      const inner = sdRoundRect(px, py, innerW / 2, innerH / 2, r);
      const outer = sdRoundRect(
        px,
        py,
        innerW / 2 + thickness,
        innerH / 2 + thickness,
        r + thickness,
      );
      // Inside the outer shape and outside the inner one, with a hair of overlap so no
      // background shows through between the ring and the camera.
      img.blend(x, y, color, Math.min(cover(outer), cover(-inner - 1)));
    }
  }
  return img;
}
