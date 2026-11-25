/**
 * Drawing of one volmeter channel bar on a 2D canvas, matching the look of the former WebGL
 * shader: a dimmed green/yellow/red scale, lit up to the current level and at the peak hold.
 * Pure helpers with no state, so the controller only has to deal with data and timing.
 */

export const CHANNEL_HEIGHT = 3;
export const SPACE_BETWEEN_CHANNELS = 2;
const PEAK_WIDTH = 4;
const WARNING_LEVEL = -20;
const DANGER_LEVEL = -9;
const MIN_LEVEL = -60;

// Colors (RGB)
const GREEN = [128, 245, 210];
const LIGHT_MODE_GREEN = [18, 128, 121];
const YELLOW = [255, 205, 71];
const RED = [252, 62, 63];

/** px position of a dB level on a scale `width` px wide; anything at or below MIN_LEVEL is 0 */
export function dbToPx(db: number, width: number) {
  return Math.round(Math.max((db - MIN_LEVEL) / -MIN_LEVEL, 0) * width);
}

const rgb = (color: number[], multiplier = 1) =>
  `rgb(${color.map(c => Math.round(c * multiplier)).join(',')})`;

/** A colored section of the scale: px range plus its lit and dimmed fill styles */
export interface IMeterZone {
  from: number;
  to: number;
  lit: string;
  dim: string;
}

/**
 * The green, yellow and red sections of a scale `width` px wide. The unlit scale is the same
 * color dimmed; it looks brighter against a darker background, so the dark theme needs less
 * dimming.
 */
export function createZones(isDarkTheme: boolean, width: number): IMeterZone[] {
  const dimming = isDarkTheme ? 0.2 : 0.5;
  const warning = dbToPx(WARNING_LEVEL, width);
  const danger = dbToPx(DANGER_LEVEL, width);
  return [
    { color: isDarkTheme ? GREEN : LIGHT_MODE_GREEN, from: 0, to: warning },
    { color: YELLOW, from: warning, to: danger },
    { color: RED, from: danger, to: Infinity },
  ].map(({ color, from, to }) => ({ from, to, lit: rgb(color), dim: rgb(color, dimming) }));
}

/** Fills the part of [x0, x1) that lies in each zone with that zone's color */
function fillZones(
  ctx: CanvasRenderingContext2D,
  zones: IMeterZone[],
  x0: number,
  x1: number,
  y: number,
  lit: boolean,
) {
  for (const zone of zones) {
    const start = Math.max(zone.from, x0);
    const end = Math.min(zone.to, x1);
    if (end <= start) continue;
    ctx.fillStyle = lit ? zone.lit : zone.dim;
    ctx.fillRect(start, y, end - start, CHANNEL_HEIGHT);
  }
}

/**
 * Draws one channel bar at `y` across `width` px. `levelPx` and `holdPx` are positions from
 * `dbToPx`; a hold of 0 means there is none (yet).
 */
export function paintChannelBar(
  ctx: CanvasRenderingContext2D,
  zones: IMeterZone[],
  width: number,
  y: number,
  levelPx: number,
  holdPx: number,
) {
  fillZones(ctx, zones, 0, width, y, false);
  if (levelPx > 0) fillZones(ctx, zones, 0, levelPx, y, true);
  if (holdPx > 0) fillZones(ctx, zones, holdPx, holdPx + PEAK_WIDTH, y, true);
}
