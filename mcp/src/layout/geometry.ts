/**
 * Canvas geometry.
 *
 * The agent CANNOT see the rendered output, so every spatial fact it gets has to be
 * computed here. These are pure functions over rectangles -- no RPC, no state -- which
 * makes them the one part of this server that is trivially testable.
 *
 * Two consumers:
 *  - presets.ts, to compute exact placements
 *  - the prose deltas in tool results and confirmation prompts
 *
 * `buildWarnings` in desktop/snapshot.ts predates this module and duplicates a couple of
 * these predicates; it now calls into here so there is one definition of "off canvas".
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Canvas = [number, number];

/**
 * Broadcast title-safe inset. Overlays inside this margin survive the crop that some
 * players and mobile clients apply, and it keeps things clear of Twitch/YouTube chrome.
 */
export const TITLE_SAFE_MARGIN = 48;

export type Anchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export const ANCHORS: Anchor[] = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export const round = (n: number) => Math.round(n * 100) / 100;

export function rect(x: number, y: number, width: number, height: number): Rect {
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

export function right(r: Rect): number {
  return r.x + r.width;
}

export function bottom(r: Rect): number {
  return r.y + r.height;
}

export function area(r: Rect): number {
  return Math.max(0, r.width) * Math.max(0, r.height);
}

export function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(right(a), right(b)) - x;
  const h = Math.min(bottom(a), bottom(b)) - y;
  if (w <= 0 || h <= 0) return null;
  return rect(x, y, w, h);
}

export function intersects(a: Rect, b: Rect): boolean {
  return intersection(a, b) !== null;
}

/** Fraction of `a` that `b` covers, 0..1. Used to distinguish a nudge from an eclipse. */
export function overlapFraction(a: Rect, b: Rect): number {
  const hit = intersection(a, b);
  if (!hit || area(a) === 0) return 0;
  return round(area(hit) / area(a));
}

export function isZeroSize(r: Rect): boolean {
  return r.width <= 0 || r.height <= 0;
}

/** Entirely outside the canvas -- invisible to viewers. */
export function isFullyOffCanvas(r: Rect, canvas: Canvas): boolean {
  const [cw, ch] = canvas;
  return right(r) <= 0 || bottom(r) <= 0 || r.x >= cw || r.y >= ch;
}

/** Any part hanging over an edge -- visible but clipped. */
export function isPartlyOffCanvas(r: Rect, canvas: Canvas): boolean {
  const [cw, ch] = canvas;
  return r.x < 0 || r.y < 0 || right(r) > cw || bottom(r) > ch;
}

export function violatesSafeArea(r: Rect, canvas: Canvas, margin = TITLE_SAFE_MARGIN): boolean {
  const [cw, ch] = canvas;
  return r.x < margin || r.y < margin || right(r) > cw - margin || bottom(r) > ch - margin;
}

/** Covers the whole canvas -- i.e. it is the background layer. */
export function isFullBleed(r: Rect, canvas: Canvas): boolean {
  const [cw, ch] = canvas;
  return r.x <= 0 && r.y <= 0 && right(r) >= cw && bottom(r) >= ch;
}

/** Human-readable region, for prose deltas: "bottom-right", "center". */
export function regionName(r: Rect, canvas: Canvas): string {
  const [cw, ch] = canvas;
  if (isFullBleed(r, canvas)) return 'full-bleed';

  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const col = cx < cw / 3 ? 'left' : cx > (cw * 2) / 3 ? 'right' : 'center';
  const row = cy < ch / 3 ? 'top' : cy > (ch * 2) / 3 ? 'bottom' : 'middle';

  if (row === 'middle' && col === 'center') return 'center';
  if (row === 'middle') return `center-${col}`;
  if (col === 'center') return `${row}-center`;
  return `${row}-${col}`;
}

/** "bottom-right (1380, 750) 480x270" */
export function describeRect(r: Rect, canvas: Canvas): string {
  return `${regionName(r, canvas)} (${r.x}, ${r.y}) ${r.width}x${r.height}`;
}

/**
 * Where to put a `size` box so it sits at `anchor`, inset by `margin` from the canvas
 * edges. Lets a caller say "bottom-left" instead of inventing pixel coordinates.
 */
export function anchorRect(
  anchor: Anchor,
  size: { width: number; height: number },
  canvas: Canvas,
  margin = TITLE_SAFE_MARGIN,
): Rect {
  const [cw, ch] = canvas;
  const [vert, horiz] = anchor.split('-') as [string, string];

  let x: number;
  if (horiz === 'left') x = margin;
  else if (horiz === 'right') x = cw - margin - size.width;
  else x = (cw - size.width) / 2;

  let y: number;
  if (vert === 'top') y = margin;
  else if (vert === 'bottom') y = ch - margin - size.height;
  else y = (ch - size.height) / 2;

  return rect(x, y, size.width, size.height);
}

export interface GeometryNote {
  ok: boolean;
  text: string;
}

/**
 * The checks worth stating after a placement. Kept deliberately short -- these land in
 * confirmation prompts a human reads under time pressure, so noise is expensive.
 *
 * `others` should exclude full-bleed backgrounds; overlapping the background is the
 * normal case and flagging it every time trains people to ignore the output.
 */
export function inspectPlacement(
  name: string,
  r: Rect,
  canvas: Canvas,
  others: Array<{ name: string; rect: Rect }> = [],
): GeometryNote[] {
  const notes: GeometryNote[] = [];

  if (isZeroSize(r)) {
    notes.push({ ok: false, text: `"${name}" has zero size -- the capture may be dead` });
    return notes;
  }

  if (isFullyOffCanvas(r, canvas)) {
    notes.push({ ok: false, text: `"${name}" is entirely off-canvas -- viewers see nothing` });
    return notes;
  }

  if (isPartlyOffCanvas(r, canvas)) {
    notes.push({ ok: false, text: `"${name}" hangs over the canvas edge and will be clipped` });
  } else if (violatesSafeArea(r, canvas)) {
    notes.push({ ok: false, text: `"${name}" is inside the ${TITLE_SAFE_MARGIN}px title-safe margin` });
  } else {
    notes.push({ ok: true, text: `inside title-safe area (${TITLE_SAFE_MARGIN}px margin)` });
  }

  const collisions = others
    .filter(o => o.name !== name && !isFullBleed(o.rect, canvas))
    .map(o => ({ name: o.name, frac: overlapFraction(o.rect, r) }))
    .filter(o => o.frac > 0.05);

  if (collisions.length === 0) {
    if (others.length) notes.push({ ok: true, text: 'no overlap with other items' });
  } else {
    for (const c of collisions) {
      notes.push({
        ok: false,
        text: `covers ${Math.round(c.frac * 100)}% of "${c.name}"`,
      });
    }
  }

  return notes;
}
