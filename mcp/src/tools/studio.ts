/**
 * "Studio" tools: one call per thing a streamer actually asks for.
 *
 * The granular tools (add_source, set_item_transform, reorder_item, set_source_settings) are
 * correct but need many precise calls -- four scenes is ~30 calls, each a chance for a small
 * model to get an argument wrong, at 20-30 s of local inference apiece. These tools take
 * ROLES and HEX COLORS instead of OBS types and ABGR integers, and do the placement,
 * stacking order and source reuse server-side:
 *
 *   build_scene  -- create a scene from a list of roles (background, game, webcam, text)
 *   apply_style  -- recolor/refont every scene in one call, optional webcam frame
 *   set_camera   -- point a webcam source at a device by name ("NVIDIA Broadcast")
 */

import fs from 'node:fs';
import path from 'node:path';
import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Ctx, ItemDetail, fail, guard, ok, requestedBy, sceneDetail } from './shared.js';
import { toItemRef } from './performance.js';
import { SceneRef, SourceRef } from '../desktop/resolver.js';
import {
  ANCHORS,
  Anchor,
  Canvas,
  TITLE_SAFE_MARGIN,
  anchorRect,
  describeRect,
} from '../layout/geometry.js';
import { log } from '../log.js';
import { FRAME_STRIP_RE, presentForModel } from '../present.js';
import { PATTERNS, Pattern, drawBackground } from '../assets/draw.js';
import { encodePng } from '../assets/png.js';
import { ASSET_DIR, textAsset } from '../assets/store.js';

// ------------------------------------------------------------------ colors

const NAMED_COLORS: Record<string, string> = {
  purple: '#a855f7',
  violet: '#8b5cf6',
  lavender: '#c4b5fd',
  lilac: '#d8b4fe',
  pink: '#f472b6',
  'pastel pink': '#fbcfe8',
  'hot pink': '#ec4899',
  magenta: '#d946ef',
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#facc15',
  gold: '#eab308',
  green: '#22c55e',
  mint: '#a7f3d0',
  teal: '#14b8a6',
  cyan: '#22d3ee',
  blue: '#3b82f6',
  'sky blue': '#7dd3fc',
  navy: '#1e3a8a',
  indigo: '#6366f1',
  white: '#ffffff',
  black: '#000000',
  gray: '#6b7280',
  grey: '#6b7280',
  'dark purple': '#2e1065',
  'deep purple': '#3b0764',
  'dark gray': '#1f2937',
};

/** WCAG relative luminance contrast ratio between two colors (1..21). */
export function contrastRatio(a: string, b: string): number {
  const lum = (input: string) => {
    const { r, g, b } = parseRgb(input);
    const ch = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Text color with the best contrast against `bg`: white, or a deep purple-black. */
function readableTextOn(bg: string): string {
  return contrastRatio('#ffffff', bg) >= contrastRatio('#1e1033', bg) ? '#ffffff' : '#1e1033';
}

function parseRgb(input: string): { r: number; g: number; b: number } {
  const obs = toObsColor(input);
  return { r: obs & 0xff, g: (obs >>> 8) & 0xff, b: (obs >>> 16) & 0xff };
}

/** "#a855f7" / "a855f7" / "#abc" / "purple" -> OBS color (0xAABBGGRR, unsigned). */
export function toObsColor(input: string): number {
  let s = input.trim().toLowerCase();
  if (NAMED_COLORS[s]) s = NAMED_COLORS[s];
  s = s.replace(/^#/, '');
  if (/^[0-9a-f]{3}$/.test(s)) {
    s = s
      .split('')
      .map(c => c + c)
      .join('');
  }
  if (!/^[0-9a-f]{6}$/.test(s)) {
    throw new Error(
      `"${input}" is not a color. Use a hex code like "#a855f7" or a simple name like "purple" or "pink".`,
    );
  }
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

const colorParam = (what: string) =>
  z.string().optional().describe(`${what} as a hex code like "#a855f7", or a simple color name.`);

// ------------------------------------------------------------------ roles

const ROLES = ['background', 'game', 'webcam', 'text', 'sticker', 'alerts'] as const;
type Role = typeof ROLES[number];

/** Bottom-to-top stacking. New items land on top, so adding in this order stacks correctly. */
const LAYER: Record<Role, number> = {
  background: 0,
  game: 1,
  webcam: 2,
  text: 3,
  sticker: 4, // after text, so stickers can keep clear of it
  alerts: 5,
};

const STICKER_SIZES = { small: 110, medium: 170, large: 240, huge: 320 } as const;
const STICKER_ANIMATIONS = ['none', 'float', 'twinkle', 'bounce', 'spin'] as const;
type StickerAnimation = typeof STICKER_ANIMATIONS[number];
const MAX_STICKERS_PER_SCENE = 6;

const DEFAULT_FONT = 'Segoe UI Black';
const DEFAULT_BG = '#1e1b2e';

const GAME_CAPTURE_NAME = 'Game Capture';
const WEBCAM_NAME = 'Webcam';
const ALERT_BOX_NAME = 'Alert Box';
/** WidgetType.AlertBox in app/services/widgets/widgets-data.ts */
const WIDGET_TYPE_ALERT_BOX = 0;

/** OBS window spec "title:class:exe" for games we know; anything else hooks any fullscreen app. */
const KNOWN_GAMES: Array<{ match: RegExp; window: string }> = [
  { match: /fortni(te|ght)/i, window: 'Fortnite:UnrealWindow:FortniteClient-Win64-Shipping.exe' },
  { match: /valorant/i, window: 'VALORANT  :UnrealWindow:VALORANT-Win64-Shipping.exe' },
  { match: /minecraft/i, window: 'Minecraft:GLFW30:javaw.exe' },
];

function gameCaptureSettings(game?: string): Record<string, unknown> {
  const known = game ? KNOWN_GAMES.find(g => g.match.test(game)) : undefined;
  return known
    ? { capture_mode: 'window', window: known.window, priority: 2 }
    : { capture_mode: 'any_fullscreen' };
}

const itemSchema = z.object({
  role: z
    .enum(ROLES)
    .optional()
    .describe(
      'Can be left out when obvious: an item with "emoji" is a sticker, with "game" a game ' +
        'capture, with "text" a text label. ' +
        'background = full-screen color block; game = game capture (shared by all scenes); ' +
        'webcam = your camera (shared by all scenes); text = a text label; sticker = a big ' +
        'color emoji as decoration (optionally animated); alerts = the Streamlabs Alert Box ' +
        'widget (follows, subs, donations pop up here).',
    ),
  text: z.string().optional().describe('For role "text": the words to show.'),
  emoji: z
    .string()
    .optional()
    .describe('For role "sticker": one to three emoji, e.g. "🌸", "✨", "🎮💜".'),
  animate: z
    .enum(STICKER_ANIMATIONS)
    .optional()
    .describe('For role "sticker": a gentle animation. Default none.'),
  game: z.string().optional().describe('For role "game": the game name, e.g. "Minecraft".'),
  color: z
    .string()
    .optional()
    .describe('Hex color like "#a855f7". background fill, or text color.'),
  anchor: z
    .enum(ANCHORS as [Anchor, ...Anchor[]])
    .optional()
    .describe('Where to put it. Defaults: webcam bottom-right, text center.'),
  width_percent: z
    .number()
    .min(5)
    .max(100)
    .optional()
    .describe(
      'Webcam width as % of the screen. Default 25. Full screen: 100 with "anchor": ' +
        '"center" and "flush": true.',
    ),
  size: z
    .enum(['small', 'medium', 'large', 'huge'])
    .optional()
    .describe('For roles "text" (default large) and "sticker" (default medium).'),
  flush: z
    .boolean()
    .optional()
    .describe('For role "webcam": true = right against the screen edge/corner, no margin.'),
});
type BuildItem = z.infer<typeof itemSchema> & { role: Role };

/** Fill in a role the model left out, when the other fields make it obvious. */
function withRole(it: z.infer<typeof itemSchema>): BuildItem {
  if (it.role) return it as BuildItem;
  let role: Role | undefined;
  if (it.emoji) role = 'sticker';
  else if (it.game) role = 'game';
  else if (it.text) role = 'text';
  else if (it.width_percent !== undefined || it.flush) role = 'webcam';
  if (!role) {
    throw new Error(
      `An item has no "role" and it isn't clear what it is: ${JSON.stringify(it)}. ` +
        `Roles: ${ROLES.join(', ')}.`,
    );
  }
  return { ...it, role };
}

// ------------------------------------------------------------------ helpers

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Studio writes run one at a time. Models fire several build_scene calls in parallel, and
 * two concurrent builds would both create "Webcam" or both claim the placeholder scene.
 */
let writeChain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.catch(() => undefined);
  return run;
}

async function canvasOf(ctx: Ctx): Promise<Canvas> {
  return (await ctx.snapshot.build({ maxAgeMs: 30_000 })).canvas;
}

/** Re-read a scene until `name` exists and (optionally) has a real size. Capture sources
 *  report 0x0 for a moment after creation. */
async function waitForItem(
  ctx: Ctx,
  scene: SceneRef,
  name: string,
  needSize: boolean,
  attempts = 15,
): Promise<ItemDetail> {
  let last: ItemDetail | undefined;
  for (let i = 0; i < attempts; i++) {
    ctx.resolver.invalidate();
    const items = await sceneDetail(ctx, scene);
    last = items.find(it => it.name === name && it.display === 'horizontal');
    if (last && (!needSize || last.sourceWidth > 0)) return last;
    await sleep(200);
  }
  if (!last) throw new Error(`Created "${name}" but it did not appear in "${scene.name}".`);
  return last;
}

/** Size by width % of canvas (aspect preserved) and place at an anchor. */
async function place(
  ctx: Ctx,
  scene: SceneRef,
  item: ItemDetail,
  canvas: Canvas,
  opts: { anchor?: Anchor; widthPercent?: number; flush?: boolean },
): Promise<void> {
  // Unknown size (camera still starting): assume 16:9 1080p so the math still lands.
  const srcW = item.sourceWidth > 0 ? item.sourceWidth : 1920;
  const srcH = item.sourceHeight > 0 ? item.sourceHeight : 1080;

  let scale = item.transform.scale;
  if (opts.widthPercent !== undefined) {
    const s = (canvas[0] * opts.widthPercent) / 100 / srcW;
    scale = { x: s, y: s };
  }
  const size = { width: srcW * scale.x, height: srcH * scale.y };
  const r = opts.anchor ? anchorRect(opts.anchor, size, canvas, opts.flush ? 0 : undefined) : null;

  if (item.sourceWidth <= 0) {
    // The editor's resize command needs a bounding box and throws on a 0x0 item (camera
    // still starting). Set the transform on the item directly instead; it applies once the
    // camera delivers frames.
    await ctx.client.request(item.resourceId, 'setTransform', [
      { scale, ...(r ? { position: { x: r.x, y: r.y } } : {}) },
    ]);
    return;
  }

  await ctx.commands.setItemTransform(
    scene,
    toItemRef(item),
    { scale, ...(r ? { position: { x: r.x, y: r.y } } : {}) },
    { position: item.transform.position, scale: item.transform.scale },
  );
}

interface DeviceOption {
  description: string;
  value: string;
}

async function videoDevices(ctx: Ctx, sourceId: string): Promise<DeviceOption[]> {
  const form = await ctx.client.request<any[]>(`Source["${sourceId}"]`, 'getPropertiesFormData');
  const prop = (form ?? []).find(p => p?.name === 'video_device_id');
  const seen = new Set<string>();
  return ((prop?.options ?? []) as DeviceOption[]).filter(o => {
    if (!o?.description || seen.has(o.description)) return false;
    seen.add(o.description);
    return true;
  });
}

const VIRTUAL_CAMERA = /nvidia broadcast|virtual|obs|streamlabs|snap camera|xsplit/i;
const NVIDIA_CAMERA = /nvidia broadcast/i;

/**
 * Cameras as the app already knows them (HardwareService), WITHOUT opening any device.
 * getPropertiesFormData on a dshow source re-enumerates (opens) every device inside OBS, which
 * is slow and synchronous -- so read the cached list instead on the hot path.
 */
async function knownCameras(ctx: Ctx): Promise<DeviceOption[]> {
  const state = await ctx.client.request<{
    dshowDevices?: Array<{ id: string; description: string; type: string }>;
  }>('HardwareService', 'state');
  return (state?.dshowDevices ?? [])
    .filter(d => d.type === 'videoInput' && d.id)
    .map(d => ({ description: d.description, value: d.id }));
}

/** NVIDIA Broadcast registers a camera filter per architecture; "(Win32)" is the one this x64 OBS build loads. */
function nvidiaCamera(devices: DeviceOption[]): DeviceOption | undefined {
  const all = devices.filter(d => NVIDIA_CAMERA.test(d.description));
  return all.find(d => /\(Win32\)/.test(d.description)) ?? all[0];
}

/**
 * Which device a NEW webcam source opens: the real camera, never the NVIDIA Broadcast one.
 *
 * Effect changes reconfigure the camera pipeline, so the clean sequence is: release the
 * camera, change the effect, then attach to the processed camera. The webcam therefore starts
 * on the real camera, and set_camera switches to NVIDIA Broadcast after the effect is set.
 */
async function initialWebcamDevice(ctx: Ctx): Promise<DeviceOption | undefined> {
  const devices = await knownCameras(ctx);
  return devices.find(d => !VIRTUAL_CAMERA.test(d.description)) ?? devices[0];
}

function matchDevice(devices: DeviceOption[], wanted: string): DeviceOption | undefined {
  const w = wanted.toLowerCase().trim();
  return (
    devices.find(d => d.description.toLowerCase() === w) ??
    devices.find(d => d.description.toLowerCase().includes(w)) ??
    devices.find(d => w.split(/\s+/).every(part => d.description.toLowerCase().includes(part)))
  );
}

async function settingsOf(ctx: Ctx, sourceId: string): Promise<Record<string, any>> {
  return (
    (await ctx.client.request<Record<string, any>>(`Source["${sourceId}"]`, 'getSettings')) ?? {}
  );
}

function findSource(sources: SourceRef[], name: string): SourceRef | undefined {
  return sources.find(s => s.name === name);
}

/** The camera source showing in some scene right now (the scene on screen first). */
async function liveCamera(ctx: Ctx): Promise<SourceRef | undefined> {
  const active = await ctx.resolver.activeScene();
  const scenes = await ctx.resolver.sceneList();
  const ordered = [active, ...scenes.filter(x => x.id !== active.id)];
  for (const scene of ordered) {
    const cam = (await sceneDetail(ctx, scene)).find(
      i => i.display === 'horizontal' && i.type === 'dshow_input' && i.visible,
    );
    if (cam) return (await ctx.resolver.sources()).find(x => x.sourceId === cam.sourceId);
  }
  return undefined;
}

function summarize(items: ItemDetail[], canvas: Canvas) {
  // Top of the scene list first, which is what draws on top. One logical webcam and frame.
  const view = presentForModel(
    items
      .filter(i => i.display === 'horizontal')
      .map(i => ({
        ...i,
        rect: [i.rect.x, i.rect.y, i.rect.width, i.rect.height] as [number, number, number, number],
      })),
  );
  return view.map(i => {
    const [x, y, w, h] = i.rect;
    return `${i.name} (${i.type}) — ${describeRect({ x, y, width: w, height: h }, canvas)}`;
  });
}

// ------------------------------------------------------------------ text styling

const TEXT_SIZE_PX = { small: 48, medium: 80, large: 120, huge: 160 } as const;
type TextSize = keyof typeof TEXT_SIZE_PX;
/** GDI+ font flags. */
const FONT_BOLD = 1;
const FONT_ITALIC = 2;

const onOffColor = z.union([z.boolean(), z.string()]);

/** Text options shared by apply_style (every text) and edit_text (one text). */
const textStyleShape = {
  text_outline: onOffColor
    .optional()
    .describe(
      'Outline around the letters: false = no outline, true = in the accent color, or a hex ' +
        'color. Leave out to keep it as it is.',
    ),
  text_outline_size: z
    .number()
    .min(1)
    .max(20)
    .optional()
    .describe('Outline thickness, 1-20 (default 6).'),
  text_bold: z.boolean().optional().describe('Bold letters.'),
  text_italic: z.boolean().optional().describe('Italic letters.'),
  text_size: z
    .enum(['small', 'medium', 'large', 'huge'])
    .optional()
    .describe('Letter size. It is shrunk automatically if it would not fit.'),
  text_background: onOffColor
    .optional()
    .describe(
      'A soft box behind the text (a label or sticker look): a hex color, or false to remove it.',
    ),
  text_background_opacity: z
    .number()
    .min(10)
    .max(100)
    .optional()
    .describe('How solid the box is, 10-100 (default 75).'),
  text_gradient: onOffColor
    .optional()
    .describe(
      'Letters fade from the text color (top) into this hex color (bottom); false removes it.',
    ),
};

interface TextStyleOpts {
  text_outline?: boolean | string;
  text_outline_size?: number;
  text_bold?: boolean;
  text_italic?: boolean;
  text_size?: TextSize;
  text_background?: boolean | string;
  text_background_opacity?: number;
  text_gradient?: boolean | string;
}

/** Models write "none" / "false" / "off" as strings as often as booleans. */
function onOff(v: boolean | string | undefined): boolean | string | undefined {
  if (typeof v !== 'string') return v;
  const t = v.trim().toLowerCase();
  if (['false', 'none', 'off', 'no', 'remove', ''].includes(t)) return false;
  if (['true', 'on', 'yes', 'accent'].includes(t)) return true;
  return v;
}

function hasTextStyle(o: TextStyleOpts): boolean {
  return Object.values(o).some(v => v !== undefined);
}

/** OBS color (0xAABBGGRR) -> "#rrggbb". */
function fromObsColor(c: number): string {
  const hex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${hex(c & 0xff)}${hex((c >>> 8) & 0xff)}${hex((c >>> 16) & 0xff)}`;
}

/** The emoji cleanText takes out, so they can be offered as a sticker instead. */
function emojiIn(text: string): string {
  return (text.match(/\p{Extended_Pictographic}\u{FE0F}?/gu) ?? []).slice(0, 3).join('');
}

/** What to tell the model when text had emoji: they belong in a sticker. */
function emojiNote(scene: string, emoji: string): string {
  return (
    `Text labels can't draw emoji, so ${emoji} was left out of the words (not an error). ` +
    `Emoji work as stickers: to show it, call add_to_scene {"scene": "${scene}", "items": ` +
    `[{"role": "sticker", "emoji": "${emoji}"}]}.`
  );
}

/** GDI+ text renders emoji as empty boxes; strip them. */
function cleanText(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|\u{FE0F}|\u{200D}|\u{20E3}/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Add one text source's style changes to `patch`. `accent` is the color `text_outline: true`
 * uses. Returns notes for anything adjusted for readability.
 */
function textStylePatch(
  current: Record<string, any>,
  o: TextStyleOpts,
  accent: number | undefined,
  patch: Record<string, unknown>,
): string[] {
  const notes: string[] = [];
  const outline = onOff(o.text_outline);
  if (outline === false) {
    patch.outline = false;
  } else if (outline !== undefined) {
    patch.outline = true;
    patch.outline_color =
      outline === true
        ? accent ??
          (typeof current.outline_color === 'number'
            ? current.outline_color
            : toObsColor('#f472b6'))
        : toObsColor(outline);
    patch.outline_size = o.text_outline_size ?? current.outline_size ?? 6;
    patch.outline_opacity = 100;
  } else if (o.text_outline_size !== undefined && current.outline) {
    patch.outline_size = o.text_outline_size;
  }

  const font = { ...(current.font ?? {}), ...((patch.font as object) ?? {}) } as Record<
    string,
    any
  >;
  let fontChanged = !!patch.font;
  if (o.text_size) {
    font.size = TEXT_SIZE_PX[o.text_size];
    fontChanged = true;
  }
  if (o.text_bold !== undefined || o.text_italic !== undefined) {
    let flags = Number(font.flags) || 0;
    if (o.text_bold !== undefined) flags = o.text_bold ? flags | FONT_BOLD : flags & ~FONT_BOLD;
    if (o.text_italic !== undefined) {
      flags = o.text_italic ? flags | FONT_ITALIC : flags & ~FONT_ITALIC;
    }
    font.flags = flags;
    font.style = '';
    fontChanged = true;
  }
  if (fontChanged) {
    font.face = font.face ?? DEFAULT_FONT;
    font.size = font.size ?? TEXT_SIZE_PX.large;
    patch.font = font;
  }

  const background = onOff(o.text_background);
  if (background === false) {
    patch.bk_opacity = 0;
  } else if (background !== undefined || o.text_background_opacity !== undefined) {
    let boxHex = '#ffffff';
    if (typeof background === 'string') boxHex = background;
    else if (typeof current.bk_color === 'number' && current.bk_opacity) {
      boxHex = fromObsColor(current.bk_color);
    }
    patch.bk_color = toObsColor(boxHex);
    patch.bk_opacity = o.text_background_opacity ?? (current.bk_opacity || 75);
    // A mostly-solid box decides readability: keep the text readable on it.
    if ((patch.bk_opacity as number) >= 50) {
      const textObs =
        (patch.color as number | undefined) ??
        (typeof current.color === 'number' ? current.color : 0xffffffff);
      const textHex = fromObsColor(textObs);
      if (contrastRatio(textHex, boxHex) < 3) {
        const better = readableTextOn(boxHex);
        patch.color = toObsColor(better);
        notes.push(`Text ${textHex} was hard to read on the ${boxHex} box; used ${better}.`);
      }
    }
  }

  const gradient = onOff(o.text_gradient);
  if (gradient === false) {
    patch.gradient = false;
  } else if (typeof gradient === 'string') {
    patch.gradient = true;
    patch.gradient_color = toObsColor(gradient);
    patch.gradient_dir = 90;
  }
  return notes;
}

/** GDI+ text defaults for the effect settings (what an unset key renders as). */
const TEXT_EFFECT_DEFAULTS: Record<string, unknown> = {
  outline: false,
  outline_size: 2,
  outline_color: 0xffffffff,
  outline_opacity: 100,
  bk_color: 0,
  bk_opacity: 0,
  gradient: false,
  gradient_color: 0xffffffff,
  gradient_dir: 90,
  extents: false,
};

/**
 * Apply a text style change as one undoable edit. Streamlabs' undo merges the "before" settings
 * back, so a setting that did not exist before (a new box, a gradient) would survive an undo.
 * Writing its default first (renders the same, off the undo stack) gives undo a value to restore.
 */
async function setTextSettings(
  ctx: Ctx,
  sourceId: string,
  current: Record<string, any>,
  patch: Record<string, unknown>,
): Promise<void> {
  const seed: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    if (current[key] === undefined && key in TEXT_EFFECT_DEFAULTS) {
      seed[key] = TEXT_EFFECT_DEFAULTS[key];
    }
  }
  if (Object.keys(seed).length) {
    await ctx.client.request(`Source["${sourceId}"]`, 'updateSettings', [seed]);
  }
  await ctx.commands.setSourceSettings(sourceId, patch);
}

interface TextRelayout {
  scene: SceneRef;
  name: string;
  sourceId: string;
  /** Where the text's center was before the change, so it grows/shrinks in place. */
  center: { x: number; y: number };
  /** Size changed on purpose: start again from scale 1 (then shrink only if it overflows). */
  resetScale: boolean;
}

/** Note a text's center before changing it. */
function relayoutEntry(scene: SceneRef, item: ItemDetail, resetScale: boolean): TextRelayout {
  return {
    scene,
    name: item.name,
    sourceId: item.sourceId,
    center: { x: item.rect.x + item.rect.width / 2, y: item.rect.y + item.rect.height / 2 },
    resetScale,
  };
}

/**
 * After text changes: give a background box some padding (GDI+ draws it tight against the
 * letters), put the text back where it was centered, then keep it on screen and clear of the
 * webcam.
 */
async function relayoutText(ctx: Ctx, r: TextRelayout, canvas: Canvas): Promise<void> {
  const find = async () => {
    ctx.resolver.invalidate();
    return (await sceneDetail(ctx, r.scene)).find(
      i => i.display === 'horizontal' && i.name === r.name,
    );
  };
  // Padding is layout, not a style choice: set it directly, off the undo stack, so "undo" takes
  // back the streamer's actual change rather than this adjustment.
  const pad = (settings: Record<string, unknown>) =>
    ctx.client.request(`Source["${r.sourceId}"]`, 'updateSettings', [settings]);
  const st = await settingsOf(ctx, r.sourceId);
  const boxed = Number(st.bk_opacity) > 0;
  if (boxed || st.extents) {
    // Measure the letters alone, then size the box around them with padding.
    await pad({ extents: false });
    await sleep(300);
    const bare = await find();
    if (boxed && bare && bare.sourceWidth > 0) {
      const padY = Math.round(bare.sourceHeight * 0.18);
      const padX = Math.round(bare.sourceHeight * 0.4);
      await pad({
        extents: true,
        extents_cx: bare.sourceWidth + 2 * padX,
        extents_cy: bare.sourceHeight + 2 * padY,
        extents_wrap: false,
        align: 'center',
        valign: 'center',
      });
      await sleep(300);
    }
  }
  const item = await find();
  if (!item || item.sourceWidth <= 0) return;
  const s = r.resetScale ? 1 : item.transform.scale.x || 1;
  await ctx.client.request(item.resourceId, 'setTransform', [
    {
      position: {
        x: Math.round(r.center.x - (item.sourceWidth * s) / 2),
        y: Math.round(r.center.y - (item.sourceHeight * s) / 2),
      },
      scale: { x: s, y: s },
    },
  ]);
  await fitText(ctx, r.scene, r.name, canvas);
}

// ------------------------------------------------------------------ decorations

/** One image source shared by every scene, just above each scene's color background. */
const BACKGROUND_PATTERN_NAME = 'Background Pattern';
const BACKGROUND_PATTERNS = ['solid', ...PATTERNS] as const;

function luminance(hex: string): number {
  return contrastRatio(hex, '#000000') / 21;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseRgb(a);
  const pb = parseRgb(b);
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(pa.r + (pb.r - pa.r) * t)}${h(pa.g + (pb.g - pa.g) * t)}${h(
    pa.b + (pb.b - pa.b) * t,
  )}`;
}

/**
 * The pattern's second color when the model gives none: a gentle tint of the background (or
 * toward the accent), so the default is tasteful rather than loud.
 */
function defaultInk(pattern: string, base: string, accent?: string): string {
  // How far toward the second color: big shapes (checker, stripes) need less contrast than
  // small motifs to read as gentle.
  const amount: Record<string, [number, number]> = {
    gradient: [0.55, 0.3],
    checker: [0.16, 0.07],
    stripes: [0.16, 0.07],
  };
  const [withAccent, plain] = amount[pattern] ?? [0.3, 0.12];
  if (accent) return mixHex(base, accent, withAccent);
  const toward = luminance(base) > 0.35 ? '#000000' : '#ffffff';
  return mixHex(base, toward, plain);
}

/** "background-dots-ede9fe-c4b5fd-1280x720.png" -> its pattern and colors. */
function parsePatternFile(file: string): { pattern: Pattern; base: string; ink: string } | null {
  const m = /background-([a-z]+)-([0-9a-f]{6})-([0-9a-f]{6})-\d+x\d+\.png$/i.exec(file);
  if (!m || !(PATTERNS as readonly string[]).includes(m[1])) return null;
  return { pattern: m[1] as Pattern, base: `#${m[2]}`, ink: `#${m[3]}` };
}

function normHex(color: string): string {
  return fromObsColor(toObsColor(color));
}

function patternFile(pattern: Pattern, base: string, ink: string, canvas: Canvas): string {
  const [w, h] = canvas;
  const file = path.join(
    ASSET_DIR,
    `background-${pattern}-${base.slice(1)}-${ink.slice(1)}-${w}x${h}.png`,
  );
  if (!fs.existsSync(file)) {
    fs.mkdirSync(ASSET_DIR, { recursive: true });
    const img = drawBackground(w, h, pattern, parseRgb(base), parseRgb(ink));
    fs.writeFileSync(file, encodePng(img.width, img.height, img.data));
  }
  return file;
}

/** The pattern on screen now, if any. */
async function currentPattern(ctx: Ctx) {
  const src = findSource(await ctx.resolver.sources(), BACKGROUND_PATTERN_NAME);
  if (!src) return null;
  const file = String((await settingsOf(ctx, src.sourceId)).file ?? '');
  const parsed = parsePatternFile(file);
  return parsed ? { ...parsed, sourceId: src.sourceId } : null;
}

/**
 * Put `pattern` behind every target scene's content ("solid" removes it). One shared source:
 * a color change regenerates one image and every scene follows.
 */
async function applyBackgroundPattern(
  ctx: Ctx,
  targets: SceneRef[],
  pattern: Pattern | 'solid',
  base: string,
  ink: string,
  canvas: Canvas,
  changed: string[],
): Promise<void> {
  if (pattern === 'solid') {
    for (const scene of targets) {
      const items = (await sceneDetail(ctx, scene)).filter(i => i.name === BACKGROUND_PATTERN_NAME);
      for (const it of items) await ctx.commands.removeItem(scene, toItemRef(it));
      if (items.length) changed.push(`${scene.name}: background pattern removed`);
    }
    return;
  }

  const file = patternFile(pattern, base, ink, canvas);
  let src = findSource(await ctx.resolver.sources(), BACKGROUND_PATTERN_NAME);
  if (src) await ctx.commands.setSourceSettings(src.sourceId, { file });

  for (const scene of targets) {
    let items = (await sceneDetail(ctx, scene)).filter(i => i.display === 'horizontal');
    const bg = items.find(i => i.name === `${scene.name} Background`);
    if (!bg) continue; // nothing to sit on (a scene without a background)
    if (!items.some(i => i.name === BACKGROUND_PATTERN_NAME)) {
      if (src) {
        await ctx.commands.addExistingSource(scene, src.sourceId);
      } else {
        await ctx.commands.addSource(scene, BACKGROUND_PATTERN_NAME, 'image_source', { file });
        ctx.resolver.invalidate();
        src = findSource(await ctx.resolver.sources(), BACKGROUND_PATTERN_NAME);
      }
      const item = await waitForItem(ctx, scene, BACKGROUND_PATTERN_NAME, false);
      // Directly above the color background, under everything else.
      await ctx.commands.reorder(scene, toItemRef(item), bg.sceneItemId, 'before');
      items = (await sceneDetail(ctx, scene)).filter(i => i.display === 'horizontal');
    }
    changed.push(`${scene.name}: ${pattern} background`);
  }
}

/** Emoji/characters in a sticker, as the reader sees them (grapheme clusters). */
function graphemes(text: string): string[] {
  const Seg = (Intl as any).Segmenter;
  if (Seg) {
    return Array.from(
      new Seg(undefined, { granularity: 'grapheme' }).segment(text),
      (s: any) => s.segment,
    );
  }
  return Array.from(text);
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => HTML_ESCAPES[c]);

/**
 * The page a sticker's browser source shows: the emoji large and centered on a transparent
 * background, drawn by Windows' color emoji font, with an optional gentle animation.
 */
function stickerPage(emoji: string, animation: StickerAnimation): string {
  const n = graphemes(emoji).length;
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
html, body { margin: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }
.s { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  font-family: "Segoe UI Emoji", "Segoe UI Symbol", sans-serif; line-height: 1;
  font-size: min(70vh, ${Math.round(88 / n)}vw); white-space: nowrap;
  filter: drop-shadow(0 0.04em 0.05em rgba(0, 0, 0, 0.22)); }
.float { animation: float 3.2s ease-in-out infinite; }
.twinkle { animation: twinkle 2.4s ease-in-out infinite; }
.bounce { animation: bounce 2s ease-in-out infinite; }
.spin { animation: spin 8s linear infinite; }
@keyframes float { 0%, 100% { transform: translateY(5%); } 50% { transform: translateY(-5%); } }
@keyframes twinkle { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(0.84); opacity: 0.7; } }
@keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-9%); } }
@keyframes spin { to { transform: rotate(360deg); } }
</style></head>
<body><div class="s ${animation === 'none' ? '' : animation}">${escapeHtml(
    emoji,
  )}</div></body></html>
`;
}

/**
 * Place a decoration at `anchor`, or at the nearest free anchor if that spot would cover the
 * webcam, text or alerts. Stickers decorate; they never hide the content.
 */
async function placeClear(
  ctx: Ctx,
  scene: SceneRef,
  item: ItemDetail,
  canvas: Canvas,
  anchor?: Anchor,
): Promise<Anchor> {
  const size = { width: item.sourceWidth, height: item.sourceHeight };
  const items = (await sceneDetail(ctx, scene)).filter(
    i => i.display === 'horizontal' && i.visible && i.sceneItemId !== item.sceneItemId,
  );
  const blockers = items.filter(
    i =>
      i.rect.width > 0 &&
      (i.type === 'dshow_input' ||
        i.type.startsWith('text_gdiplus') ||
        i.name.startsWith(ALERT_BOX_NAME) ||
        FRAME_STRIP_RE.test(i.name) ||
        / Sticker \d+$/.test(i.name)),
  );
  const pad = 12;
  const free = (a: Anchor) => {
    const r = anchorRect(a, size, canvas);
    return !blockers.some(
      b =>
        r.x < b.rect.x + b.rect.width + pad &&
        r.x + r.width > b.rect.x - pad &&
        r.y < b.rect.y + b.rect.height + pad &&
        r.y + r.height > b.rect.y - pad,
    );
  };
  // The asked-for spot, then corners (farthest from the webcam first, so decorations balance
  // the layout), then edges: decorations look best out of the middle.
  const cam = items.find(i => i.type === 'dshow_input' && i.rect.width > 0);
  const camCenter = cam
    ? { x: cam.rect.x + cam.rect.width / 2, y: cam.rect.y + cam.rect.height / 2 }
    : { x: canvas[0] / 2, y: canvas[1] }; // no webcam: prefer the top corners
  const corners = (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as Anchor[])
    .map(a => {
      const r = anchorRect(a, size, canvas);
      return {
        a,
        d: Math.hypot(r.x + r.width / 2 - camCenter.x, r.y + r.height / 2 - camCenter.y),
      };
    })
    .sort((p, q) => q.d - p.d)
    .map(p => p.a);
  const order: Anchor[] = [...(anchor ? [anchor] : []), ...corners, ...ANCHORS];
  const chosen = order.find(free) ?? anchor ?? corners[0];
  const r = anchorRect(chosen, size, canvas);
  await ctx.commands.setItemTransform(
    scene,
    toItemRef(item),
    { position: { x: Math.round(r.x), y: Math.round(r.y) }, scale: { x: 1, y: 1 } },
    { position: item.transform.position, scale: item.transform.scale },
  );
  return chosen;
}

// ------------------------------------------------------------------ tools

export function registerStudio(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'build_scene',
    {
      title: 'Build a complete scene',
      description:
        'Create a scene and fill it in ONE call. List the items by role and the server ' +
        'picks the source types, sizes, positions and stacking order (background at the ' +
        'back, text on top). The webcam and game capture are shared, so every scene reuses ' +
        'the same ones. Decorate with stickers: {"role": "sticker", "emoji": "🌸"}. ' +
        'Example: {"name": "Gameplay", "items": [{"role": "game", "game": ' +
        '"<the game>"}, {"role": "webcam", "anchor": "bottom-right", "width_percent": 25}]}.',
      inputSchema: {
        name: z.string().describe('Scene name, e.g. "Starting Soon".'),
        items: z.array(itemSchema).min(1).describe('What goes in the scene, by role.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ name: rawName, items: rawItems, requested_by }) =>
      guard('build_scene', () =>
        serial(async () => {
          const items = rawItems.map(withRole);
          // Stray quotes/brackets from the model's JSON escaping end up in the scene list.
          const name =
            rawName
              .trim()
              .replace(/^["'`[]+|["'`]]+$/g, '')
              .trim() || rawName.trim();
          for (const it of items) {
            if (it.color) toObsColor(it.color); // validate up front, before anything is created
          }

          const decision = await ctx.confirm.gate(requested_by, {
            title: `Build scene "${name}" with ${items.map(i => i.role).join(', ')}`,
          });
          if (!decision.approved) return fail(decision.reason);

          // ---- get a scene to build into
          const scenes = await ctx.resolver.sceneList();
          let scene = scenes.find(s => s.name.toLowerCase() === name.toLowerCase());
          if (scene) {
            const existing = await sceneDetail(ctx, scene);
            if (existing.length > 0) {
              return fail(
                `A scene named "${scene.name}" already exists and is not empty. Pick a different ` +
                  'name, or change this scene with apply_style / set_item_transform.',
              );
            }
          } else {
            // A fresh collection starts with one empty scene called "Scene". Reuse it rather
            // than leaving an empty extra scene in the list.
            const placeholder =
              scenes.length === 1 && scenes[0].name === 'Scene' ? scenes[0] : undefined;
            if (placeholder && (await sceneDetail(ctx, placeholder)).length === 0) {
              await ctx.commands.renameScene(placeholder.id, name);
            } else {
              await ctx.commands.createScene(name);
            }
            ctx.resolver.invalidate();
            scene = (await ctx.resolver.sceneList()).find(s => s.name === name);
            if (!scene) throw new Error(`Created scene "${name}" but cannot find it.`);
          }
          ctx.snapshot.invalidate();

          const canvas = await canvasOf(ctx);
          // A game capture is blank until the game runs; put a themed background behind it so
          // the scene never shows as plain black.
          // (Every scene: a scene without a background renders black, and apply_style
          // cannot recolor a background that does not exist.)
          const withBg: BuildItem[] = !items.some(i => i.role === 'background')
            ? [{ role: 'background' }, ...items]
            : items;
          const ordered = [...withBg].sort((a, b) => LAYER[a.role] - LAYER[b.role]);
          const warnings: string[] = [];
          let textCount = 0;

          for (const it of ordered) {
            try {
              await addRole(ctx, scene, it, canvas, () => ++textCount, warnings);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              log(`build_scene: ${it.role} failed: ${msg}`);
              warnings.push(`Could not add the ${it.role}: ${msg}`);
            }
          }

          ctx.resolver.invalidate();
          ctx.snapshot.invalidate();
          const after = await sceneDetail(ctx, scene);
          return ok({
            built: true,
            scene: scene.name,
            items: summarize(after, canvas),
            ...(warnings.length ? { warnings } : {}),
            next: 'Build the next scene, or use switch_scene to show this one.',
          });
        }),
      ),
  );

  server.registerTool(
    'add_to_scene',
    {
      title: 'Add things to an existing scene',
      description:
        'Add items to a scene that already exists, by role, in ONE call. Same roles as ' +
        'build_scene, plus "alerts" for the Streamlabs Alert Box (needs a logged-in ' +
        'Streamlabs account). Example: {"scene": "Gameplay", "items": [{"role": "alerts"}]}.',
      inputSchema: {
        scene: z.string().optional().describe('Scene name. Default: the scene on screen.'),
        items: z.array(itemSchema).min(1).describe('What to add, by role.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ scene, items: rawItems, requested_by }) =>
      guard('add_to_scene', () =>
        serial(async () => {
          const items = rawItems.map(withRole);
          for (const it of items) if (it.color) toObsColor(it.color);
          const sceneRef = await ctx.resolver.resolveScene(scene);
          const existing = await sceneDetail(ctx, sceneRef);
          const has = (role: Role) =>
            existing.some(i =>
              role === 'webcam'
                ? i.type === 'dshow_input'
                : role === 'game'
                ? i.type === 'game_capture'
                : role === 'background'
                ? i.name === `${sceneRef.name} Background`
                : role === 'alerts'
                ? i.name.startsWith(ALERT_BOX_NAME)
                : false,
            );
          const skipped = items.filter(it => it.role !== 'text' && has(it.role)).map(it => it.role);
          const todo = items.filter(it => it.role === 'text' || !has(it.role));
          if (!todo.length) {
            return fail(`"${sceneRef.name}" already has: ${skipped.join(', ')}. Nothing to add.`);
          }

          const decision = await ctx.confirm.gate(requested_by, {
            title: `Add ${todo.map(i => i.role).join(', ')} to "${sceneRef.name}"`,
          });
          if (!decision.approved) return fail(decision.reason);

          const canvas = await canvasOf(ctx);
          const warnings: string[] = skipped.length
            ? [`Already in the scene, not added again: ${skipped.join(', ')}.`]
            : [];
          let textCount = existing.filter(i => i.name.startsWith(`${sceneRef.name} Text`)).length;
          const ordered = [...todo].sort((a, b) => LAYER[a.role] - LAYER[b.role]);
          for (const it of ordered) {
            try {
              await addRole(ctx, sceneRef, it, canvas, () => ++textCount, warnings);
              // New items land on top: push backgrounds and game capture behind everything.
              if (it.role === 'background' || it.role === 'game') {
                await sendToBack(ctx, sceneRef, it.role);
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              log(`add_to_scene: ${it.role} failed: ${msg}`);
              warnings.push(`Could not add the ${it.role}: ${msg}`);
            }
          }

          ctx.resolver.invalidate();
          ctx.snapshot.invalidate();
          const after = await sceneDetail(ctx, sceneRef);
          return ok({
            added: true,
            scene: sceneRef.name,
            items: summarize(after, canvas),
            ...(warnings.length ? { warnings } : {}),
          });
        }),
      ),
  );

  server.registerTool(
    'apply_style',
    {
      title: 'Restyle all scenes',
      description:
        'Change the look of every scene in ONE call: background color and pattern, text color, font and ' +
        'text effects (outline, bold, italic, size, a box behind the text, a gradient), and an ' +
        'accent-colored frame around the webcam. Pass only what should change. ' +
        'Example: {"background_color": "#0f172a", "accent_color": "#22d3ee", "text_color": ' +
        '"#f0abfc", "font": "Segoe UI Black"}. Good fonts: "Segoe ' +
        'Print" (cute, handwritten), "Comic Sans MS" (playful), "Ink Free" (marker), ' +
        '"Segoe UI Black" (bold, clean).',
      inputSchema: {
        background_color: colorParam('Background fill'),
        background_pattern: z
          .enum(BACKGROUND_PATTERNS)
          .optional()
          .describe(
            'Background texture behind every scene, in the background colors: gradient, dots, ' +
              'stripes, checker, grid, hearts, stars, sparkles; "solid" removes it.',
          ),
        background_color_2: colorParam(
          'Second background color: the pattern, or where a gradient ends (default: a soft tint)',
        ),
        accent_color: colorParam('Accent: the webcam frame, and text outlines set to true'),
        text_color: colorParam('Text color'),
        font: z.string().optional().describe('Font name for all text, e.g. "Segoe Print".'),
        ...textStyleShape,
        webcam_frame: z
          .boolean()
          .optional()
          .describe(
            'Webcam frame: true adds or updates it, false removes it everywhere, leave it out to ' +
              'keep it as it is (an existing frame just takes the new accent color). Only pass ' +
              'this when the streamer mentions a frame or border.',
          ),
        scenes: z.array(z.string()).optional().describe('Only these scenes. Default: all scenes.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({
      background_color,
      background_pattern,
      background_color_2,
      accent_color,
      text_color,
      font,
      webcam_frame,
      scenes,
      requested_by,
      ...textOpts
    }) =>
      guard('apply_style', () =>
        serial(async () => {
          if (
            !background_color &&
            !background_pattern &&
            !background_color_2 &&
            !accent_color &&
            !text_color &&
            !font &&
            !hasTextStyle(textOpts) &&
            webcam_frame === undefined
          ) {
            return fail(
              'Nothing to change: pass colors, a font, text effects (text_outline, text_bold, ' +
                'text_size, text_background...) and/or webcam_frame.',
            );
          }
          // Readability guard: a model picking colors freely will sometimes put pale text on a
          // pale background. Keep its palette, but swap the text color when contrast is poor.
          const adjustments: string[] = [];
          let textColor = text_color;
          if (background_color) {
            const candidate = text_color ?? '#ffffff';
            if (contrastRatio(candidate, background_color) < 3) {
              textColor = readableTextOn(background_color);
              adjustments.push(
                `Text color ${candidate} was hard to read on ${background_color}; used ${textColor} instead.`,
              );
            }
          }
          const bg = background_color ? toObsColor(background_color) : undefined;
          const accent = accent_color ? toObsColor(accent_color) : undefined;
          const fg = textColor ? toObsColor(textColor) : undefined;
          const refit: TextRelayout[] = [];
          // The color `text_outline: true` uses: the new accent, or the one already on screen.
          const outlineAccent =
            accent ??
            (onOff(textOpts.text_outline) === true ? await currentAccent(ctx) : undefined);

          const all = await ctx.resolver.sceneList();
          const targets = scenes?.length
            ? scenes.map(n => {
                const s = all.find(x => x.name.toLowerCase() === n.toLowerCase());
                if (!s) {
                  throw new Error(
                    `No scene named "${n}". Scenes: ${JSON.stringify(all.map(x => x.name))}.`,
                  );
                }
                return s;
              })
            : all;

          const decision = await ctx.confirm.gate(requested_by, {
            title: `Restyle ${targets.length} scene(s)`,
          });
          if (!decision.approved) return fail(decision.reason);

          const canvas = await canvasOf(ctx);
          const changed: string[] = [];
          const touchedSources = new Set<string>();
          let frameSeen = false;

          for (const scene of targets) {
            const items = (await sceneDetail(ctx, scene)).filter(i => i.display === 'horizontal');

            for (const item of items) {
              if (touchedSources.has(item.sourceId)) continue;
              const isFrame = FRAME_STRIP_RE.test(item.name);
              if (isFrame) frameSeen = true;

              if (item.type === 'color_source' && !isFrame && bg !== undefined) {
                await ctx.commands.setSourceSettings(item.sourceId, { color: bg });
                touchedSources.add(item.sourceId);
                changed.push(`${scene.name}: ${item.name} color`);
              } else if (item.type === 'color_source' && isFrame && accent !== undefined) {
                await ctx.commands.setSourceSettings(item.sourceId, { color: accent });
                touchedSources.add(item.sourceId);
                changed.push(`${scene.name}: ${item.name} color`);
              } else if (
                item.type === 'text_gdiplus' &&
                (fg !== undefined ||
                  font ||
                  accent !== undefined ||
                  background_color ||
                  hasTextStyle(textOpts))
              ) {
                const current = await settingsOf(ctx, item.sourceId);
                const patch: Record<string, unknown> = {};
                if (fg !== undefined) patch.color = fg;
                else if (background_color && typeof current.color === 'number') {
                  // A new background with the old text color: keep the text readable on it.
                  const old = fromObsColor(current.color);
                  if (contrastRatio(old, background_color) < 3) {
                    const better = readableTextOn(background_color);
                    patch.color = toObsColor(better);
                    const note = `Text ${old} was hard to read on ${background_color}; used ${better} instead.`;
                    if (!adjustments.includes(note)) adjustments.push(note);
                  }
                }
                if (font) {
                  patch.font = {
                    ...(current.font ?? {}),
                    face: font,
                    size: current.font?.size ?? TEXT_SIZE_PX.medium,
                  };
                }
                // An outline that is already there follows the accent, like the webcam frame.
                if (
                  textOpts.text_outline === undefined &&
                  accent !== undefined &&
                  current.outline
                ) {
                  patch.outline_color = accent;
                }
                for (const note of textStylePatch(current, textOpts, outlineAccent, patch)) {
                  if (!adjustments.includes(note)) adjustments.push(note);
                }
                if (!Object.keys(patch).length) continue;
                refit.push(relayoutEntry(scene, item, !!textOpts.text_size));
                await setTextSettings(ctx, item.sourceId, current, patch);
                touchedSources.add(item.sourceId);
                changed.push(`${scene.name}: ${item.name} text style`);
              }
            }

            if (webcam_frame === true) {
              const cam = items.find(i => i.type === 'dshow_input' && i.visible);
              if (cam) {
                const strip = items.find(i => FRAME_STRIP_RE.test(i.name));
                const color =
                  accent ??
                  (strip ? (await settingsOf(ctx, strip.sourceId)).color : undefined) ??
                  (await currentAccent(ctx)) ??
                  toObsColor('#f472b6');
                await upsertWebcamFrame(ctx, scene, cam, color);
                changed.push(`${scene.name}: webcam frame`);
              }
            } else if (webcam_frame === false) {
              const n = await removeWebcamFrame(ctx, scene);
              if (n) changed.push(`${scene.name}: webcam frame removed`);
            }
          }

          if (accent !== undefined && webcam_frame === undefined && !frameSeen) {
            adjustments.push(
              'accent_color colors the webcam frame, and there is no frame, so nothing shows the ' +
                'accent yet. Pass "webcam_frame": true to add one (or do not mention a frame).',
            );
          }

          // Background pattern: asked for, or an existing one following new colors.
          const existingPattern = await currentPattern(ctx);
          const patternKind =
            background_pattern ??
            (existingPattern && (background_color || background_color_2)
              ? existingPattern.pattern
              : undefined);
          if (patternKind) {
            let base = background_color ? normHex(background_color) : existingPattern?.base;
            if (!base) {
              const bgSrc = (await ctx.resolver.sources()).find(
                x => x.type === 'color_source' && x.name.endsWith(' Background'),
              );
              const c = bgSrc ? (await settingsOf(ctx, bgSrc.sourceId)).color : undefined;
              base = typeof c === 'number' ? fromObsColor(c) : DEFAULT_BG;
            }
            let ink = base;
            if (patternKind !== 'solid') {
              if (background_color_2) ink = normHex(background_color_2);
              else if (!background_color && existingPattern?.pattern === patternKind) {
                ink = existingPattern.ink; // same pattern, same colors: keep its ink
              } else ink = defaultInk(patternKind, base, accent_color && normHex(accent_color));
            }
            await applyBackgroundPattern(ctx, targets, patternKind, base, ink, canvas, changed);
            if (patternKind !== 'solid' && contrastRatio(base, ink) > 2.2) {
              adjustments.push(
                'The pattern is high-contrast; if text gets hard to read, give it a ' +
                  'text_background box.',
              );
            }
          }

          // Text changed size: keep it centered where it was, on screen, and clear of the webcam.
          if (refit.length) await sleep(400);
          for (const r of refit) await relayoutText(ctx, r, canvas);

          ctx.snapshot.invalidate();
          return ok({
            styled: true,
            scenes: targets.map(s => s.name),
            changes: changed,
            ...(adjustments.length ? { adjustments } : {}),
            next: 'Use capture_screen to see how it looks.',
          });
        }),
      ),
  );

  server.registerTool(
    'edit_text',
    {
      title: 'Change one text: words and style',
      description:
        'Change ONE text item: its words, color, font and effects (outline, bold, italic, size, ' +
        'a box behind it, a gradient). For every text at once use apply_style instead. ' +
        'Example: {"item": "Starting Soon Text", "text": "brb, grabbing tea", "text_italic": ' +
        'true, "text_background": "#fdf2f8"}. Pass only what should change.',
      inputSchema: {
        item: z
          .string()
          .describe(
            'The text item\'s name, e.g. "Starting Soon Text", or a scene name for its text.',
          ),
        text: z.string().optional().describe('New words. No emoji (they show as empty boxes).'),
        color: colorParam('Text color'),
        font: z.string().optional().describe('Font name, e.g. "Segoe Print".'),
        ...textStyleShape,
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ item, text, color, font, requested_by, ...textOpts }) =>
      guard('edit_text', () =>
        serial(async () => {
          if (text === undefined && !color && !font && !hasTextStyle(textOpts)) {
            return fail('Nothing to change: pass text, color, font and/or text effects.');
          }
          const wanted = item.trim().toLowerCase();
          const all = await ctx.resolver.sceneList();
          let found: { scene: SceneRef; detail: ItemDetail } | undefined;
          const names: string[] = [];
          for (const scene of all) {
            const texts = (await sceneDetail(ctx, scene)).filter(
              i => i.display === 'horizontal' && i.type === 'text_gdiplus',
            );
            names.push(...texts.map(t => t.name));
            const hit =
              texts.find(t => t.name.toLowerCase() === wanted) ??
              (scene.name.toLowerCase() === wanted ? texts[0] : undefined);
            if (hit && !found) found = { scene, detail: hit };
          }
          if (!found) {
            return fail(`No text item named "${item}". Text items: ${JSON.stringify(names)}.`);
          }
          const { scene, detail } = found;

          const decision = await ctx.confirm.gate(requested_by, {
            title: `Edit the text "${detail.name}"`,
          });
          if (!decision.approved) return fail(decision.reason);

          const current = await settingsOf(ctx, detail.sourceId);
          const patch: Record<string, unknown> = {};
          const notes: string[] = [];
          if (text !== undefined) {
            const words = cleanText(text);
            const emoji = emojiIn(text);
            if (!words) {
              return fail(
                emoji
                  ? `Text needs words. ${emojiNote(scene.name, emoji)}`
                  : 'The new text is empty.',
              );
            }
            if (emoji) notes.push(emojiNote(scene.name, emoji));
            patch.text = words;
          }
          if (color) patch.color = toObsColor(color);
          if (font) {
            patch.font = {
              ...(current.font ?? {}),
              face: font,
              size: current.font?.size ?? TEXT_SIZE_PX.medium,
            };
          }
          const accent =
            onOff(textOpts.text_outline) === true ? await currentAccent(ctx) : undefined;
          notes.push(...textStylePatch(current, textOpts, accent, patch));

          const relayout = relayoutEntry(scene, detail, !!textOpts.text_size);
          await setTextSettings(ctx, detail.sourceId, current, patch);
          await sleep(400);
          await relayoutText(ctx, relayout, await canvasOf(ctx));

          ctx.snapshot.invalidate();
          return ok({
            edited: true,
            item: detail.name,
            scene: scene.name,
            changed: Object.keys(patch),
            ...(notes.length ? { adjustments: notes } : {}),
            next: 'Use capture_screen to see how it looks.',
          });
        }),
      ),
  );

  server.registerTool(
    'edit_sticker',
    {
      title: 'Change a sticker in place',
      description:
        'Change one sticker: its emoji, animation, size or position, keeping the rest. One ' +
        'call instead of removing and re-adding it. Example: {"item": "Warming Up Sticker 1", ' +
        '"emoji": "⚔️", "animate": "none"}.',
      inputSchema: {
        item: z
          .string()
          .describe(
            'The sticker\'s name, e.g. "Warming Up Sticker 1", or a scene name for its first sticker.',
          ),
        emoji: z.string().optional().describe('New emoji (one to three).'),
        animate: z.enum(STICKER_ANIMATIONS).optional().describe('New animation, or "none".'),
        size: z.enum(['small', 'medium', 'large', 'huge']).optional().describe('New size.'),
        anchor: z
          .enum(ANCHORS as [Anchor, ...Anchor[]])
          .optional()
          .describe('Move it here (it still keeps clear of the webcam and text).'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ item, emoji, animate, size, anchor, requested_by }) =>
      guard('edit_sticker', () =>
        serial(async () => {
          if (!emoji && !animate && !size && !anchor) {
            return fail('Nothing to change: pass emoji, animate, size and/or anchor.');
          }
          const wanted = item.trim().toLowerCase();
          let found: { scene: SceneRef; detail: ItemDetail } | undefined;
          const names: string[] = [];
          for (const scene of await ctx.resolver.sceneList()) {
            const stickers = (await sceneDetail(ctx, scene)).filter(
              i => i.display === 'horizontal' && / Sticker \d+$/.test(i.name),
            );
            names.push(...stickers.map(x => x.name));
            const hit =
              stickers.find(x => x.name.toLowerCase() === wanted) ??
              (scene.name.toLowerCase() === wanted ? stickers[0] : undefined);
            if (hit && !found) found = { scene, detail: hit };
          }
          if (!found) {
            return fail(`No sticker named "${item}". Stickers: ${JSON.stringify(names)}.`);
          }
          const { scene, detail } = found;
          if (emoji) {
            const count = graphemes(emoji.trim()).length;
            if (!count || count > 3) return fail('A sticker holds one to three emoji.');
          }

          const decision = await ctx.confirm.gate(requested_by, {
            title: `Change the sticker "${detail.name}"`,
          });
          if (!decision.approved) return fail(decision.reason);

          // What it shows now, read back from its page.
          const current = await settingsOf(ctx, detail.sourceId);
          let page = '';
          try {
            page = fs.readFileSync(String(current.local_file ?? ''), 'utf8');
          } catch {
            /* missing page: rebuilt below from what was asked */
          }
          const shown = /<div class="s ?([a-z]*)">([\s\S]*?)<\/div>/.exec(page);
          const unescape = (t: string) =>
            t.replace(
              /&(amp|lt|gt|quot|#39);/g,
              (_m, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e] ?? ''),
            );
          const newEmoji = emoji?.trim() ?? (shown ? unescape(shown[2]) : '✨');
          const newAnimation: StickerAnimation =
            animate ?? ((shown?.[1] as StickerAnimation) || 'none');
          const count = graphemes(newEmoji).length;
          const px = size ? STICKER_SIZES[size] : Number(current.height) || STICKER_SIZES.medium;
          const file = textAsset(
            'sticker',
            { emoji: newEmoji, animation: newAnimation, v: 1 },
            'html',
            () => stickerPage(newEmoji, newAnimation),
          );
          const width = Math.round(px * (1 + (count - 1) * 0.85));
          const center = {
            x: detail.rect.x + detail.rect.width / 2,
            y: detail.rect.y + detail.rect.height / 2,
          };
          await ctx.commands.setSourceSettings(detail.sourceId, {
            local_file: file,
            width,
            height: px,
          });
          await sleep(300);
          ctx.resolver.invalidate();
          const after = (await sceneDetail(ctx, scene)).find(
            i => i.display === 'horizontal' && i.name === detail.name,
          );
          let at: string | undefined;
          if (after && anchor) {
            at = await placeClear(ctx, scene, after, await canvasOf(ctx), anchor);
          } else if (after && (size || emoji)) {
            // Same center, so a bigger or wider sticker grows in place.
            await ctx.client.request(after.resourceId, 'setTransform', [
              {
                position: { x: Math.round(center.x - width / 2), y: Math.round(center.y - px / 2) },
                scale: { x: 1, y: 1 },
              },
            ]);
          }

          ctx.snapshot.invalidate();
          return ok({
            edited: true,
            item: detail.name,
            scene: scene.name,
            sticker: { emoji: newEmoji, animate: newAnimation, size: px },
            ...(anchor && at && at !== anchor
              ? { note: `Placed at ${at}: ${anchor} would cover something.` }
              : {}),
            next: 'Use capture_screen to see how it looks.',
          });
        }),
      ),
  );

  server.registerTool(
    'set_camera',
    {
      title: 'Choose which camera a webcam source shows',
      description:
        'Choose which camera the webcam shows in every scene, by name, or "off" to hide it and ' +
        'release the camera. For NVIDIA Broadcast effects, ALWAYS three steps in this order: ' +
        '1) this tool with {"device": "off"}, 2) NVIDIA set_effects, 3) this tool with ' +
        '{"device": "NVIDIA Broadcast"}. Releasing the camera first gives the effect change a clean ' +
        'handoff. If the name does not match, the result lists the cameras.',
      inputSchema: {
        device: z
          .string()
          .describe(
            'Camera name or part of it, e.g. "NVIDIA Broadcast", or "off" to hide the webcam.',
          ),
        source: z.string().optional().describe('Webcam source name. Default: the webcam.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ device, source, requested_by }) =>
      guard('set_camera', () =>
        serial(async () => {
          const sources = await ctx.resolver.sources();
          const cams = sources.filter(s => s.type === 'dshow_input');
          if (!cams.length) {
            return fail('There is no webcam yet. Add one with build_scene (role "webcam") first.');
          }
          void source; // every scene's webcam is switched together

          if (/^(off|none|hide|pause|disable|no camera)$/i.test(device.trim())) {
            return ok(await webcamOff(ctx));
          }

          const devices = await knownCameras(ctx);
          const isNvidia = NVIDIA_CAMERA.test(device);
          const match = isNvidia ? nvidiaCamera(devices) : matchDevice(devices, device);
          if (!match) {
            return fail(
              `No camera matching "${device}". Available cameras: ` +
                `${JSON.stringify(devices.map(d => d.description))}.`,
            );
          }

          const decision = await ctx.confirm.gate(requested_by, {
            title: `Show camera "${match.description}" as the webcam`,
          });
          if (!decision.approved) return fail(decision.reason);

          return ok(await swapCamera(ctx, cams, match));
        }),
      ),
  );
}

// ------------------------------------------------------------------ camera swap

/**
 * Hide every webcam item in every scene. Webcams are created with deactivate_when_not_showing,
 * so this releases the physical camera before an effect change. Changing effects reconfigures
 * the camera, and two apps holding the same physical camera through a reconfiguration is
 * something DirectShow handles poorly; releasing it first keeps the handoff clean.
 */
async function webcamOff(ctx: Ctx) {
  const scenes = await ctx.resolver.sceneList();
  let hidden = 0;
  for (const scene of scenes) {
    const items = (await sceneDetail(ctx, scene)).filter(
      i => i.display === 'horizontal' && i.type === 'dshow_input' && i.visible,
    );
    for (const i of items) {
      await ctx.commands.setVisibility(scene, toItemRef(i), false);
      hidden++;
    }
  }
  ctx.snapshot.invalidate();
  await sleep(2000); // let OBS finish releasing the device
  return {
    updated: true,
    webcam: 'off',
    hiddenItems: hidden,
    note:
      'The webcam is hidden and the camera is released. Now change NVIDIA Broadcast effects, ' +
      'then call set_camera with the camera to show.',
  };
}

/**
 * Show `match` as the webcam in every scene WITHOUT changing any existing source's device.
 *
 * Changing a dshow source's device makes OBS's main thread wait synchronously on the
 * DirectShow thread while the new device opens. Creating a NEW source activates the device
 * asynchronously instead, so the UI never waits on a device. So: one source per camera; create
 * the target if needed, wait for frames, then show it where the webcam is and hide the others.
 * Fails safe: if the camera does not deliver frames in time, the original webcam stays on screen.
 */
async function swapCamera(ctx: Ctx, cams: SourceRef[], match: DeviceOption) {
  const isNvidia = NVIDIA_CAMERA.test(match.description);
  const onDevice = async (c: SourceRef) => {
    const v = String((await settingsOf(ctx, c.sourceId)).video_device_id ?? '');
    return v === match.value || (isNvidia && NVIDIA_CAMERA.test(v));
  };

  let target: SourceRef | undefined;
  for (const c of cams) if (!target && (await onDevice(c))) target = c;

  // Scenes that show a webcam, and their webcam items (visible or hidden).
  const active = await ctx.resolver.activeScene();
  const scenes = await ctx.resolver.sceneList();
  const withCam: Array<{ scene: SceneRef; items: ItemDetail[] }> = [];
  for (const scene of scenes) {
    const items = (await sceneDetail(ctx, scene)).filter(
      i => i.display === 'horizontal' && i.type === 'dshow_input',
    );
    if (items.length) withCam.push({ scene, items });
  }
  if (!withCam.length) throw new Error('No scene shows the webcam. Add one with build_scene first.');

  // Already showing this camera? Reconnect it: hide (releases the device), wait, show again
  // below. Gives a clean attach if an effect was changed without releasing the camera first
  // (e.g. the agent skipped "off").
  if (target) {
    const liveItems = withCam.flatMap(w =>
      w.items.filter(i => i.sourceId === target!.sourceId && i.visible).map(i => ({ w, i })),
    );
    if (liveItems.length) {
      for (const { w, i } of liveItems) {
        await ctx.commands.setVisibility(w.scene, toItemRef(i), false);
        i.visible = false;
      }
      await sleep(2000);
    }
  }

  if (!target) {
    // Let NVIDIA Broadcast finish applying a just-enabled effect before attaching to it.
    if (isNvidia) await sleep(3000);
    const taken = new Set(cams.map(c => c.name));
    let name = isNvidia ? 'Webcam (NVIDIA Broadcast)' : `Webcam (${match.description})`;
    for (let n = 2; taken.has(name); n++) name = `${name} ${n}`;

    const first = withCam.find(w => w.scene.id === active.id) ?? withCam[0];
    await ctx.commands.addSource(first.scene, name, 'dshow_input', {
      video_device_id: match.value,
      // Like the original webcam: hiding it ("off") releases the device, so effect changes
      // (e.g. blur -> remove) always happen with the camera released.
      deactivate_when_not_showing: true,
    });
    const created = await waitForItem(ctx, first.scene, name, true, 100); // up to ~20 s (slower while the LLM loads the GPU)
    if (created.sourceWidth <= 0) {
      await ctx.commands.setVisibility(first.scene, toItemRef(created), false);
      throw new Error(
        `The ${match.description} camera did not start sending video, so nothing was switched: ` +
          'the webcam still shows the original camera. Check that NVIDIA Broadcast is running ' +
          'and its camera is working, then try again.',
      );
    }
    ctx.resolver.invalidate();
    target = findSource(await ctx.resolver.sources(), name);
    if (!target) throw new Error(`Created "${name}" but cannot find it.`);
    // Re-read: the first scene now contains the new item.
    first.items = (await sceneDetail(ctx, first.scene)).filter(
      i => i.display === 'horizontal' && i.type === 'dshow_input',
    );
  }

  for (const { scene, items } of withCam) {
    // After "off" every webcam item is hidden; any of them carries the right geometry.
    const ref =
      items.find(i => i.visible && i.sourceId !== target.sourceId) ??
      items.find(i => i.sourceId !== target.sourceId) ??
      items[0];
    let t = items.find(i => i.sourceId === target.sourceId);
    if (!t) {
      await ctx.commands.addExistingSource(scene, target.sourceId);
      t = await waitForItem(ctx, scene, target.name, true, 30);
    }
    if (ref.sceneItemId !== t.sceneItemId) {
      // Same spot and size as the webcam it replaces, directly above it.
      const srcW = t.sourceWidth > 0 ? t.sourceWidth : ref.sourceWidth > 0 ? ref.sourceWidth : 1920;
      const scale = ref.rect.width > 0 ? ref.rect.width / srcW : ref.transform.scale.x;
      await ctx.client.request(t.resourceId, 'setTransform', [
        { position: { x: ref.rect.x, y: ref.rect.y }, scale: { x: scale, y: scale } },
      ]);
      await ctx.commands.reorder(scene, toItemRef(t), ref.sceneItemId, 'before');
    }
    if (!t.visible) await ctx.commands.setVisibility(scene, toItemRef(t), true);
    for (const other of items) {
      if (other.sceneItemId !== t.sceneItemId && other.visible) {
        await ctx.commands.setVisibility(scene, toItemRef(other), false);
      }
    }
  }

  ctx.snapshot.invalidate();
  await sleep(1500); // first frames, so an immediate capture_screen shows the result
  ctx.resolver.invalidate();
  const shown = (await sceneDetail(ctx, withCam[0].scene)).find(
    i => i.sourceId === target!.sourceId && i.display === 'horizontal',
  );
  return {
    updated: true,
    camera: match.description,
    scenes: withCam.map(w => w.scene.name),
    note: `The webcam in every scene now shows the ${match.description} camera.`,
    ...(shown && shown.sourceWidth > 0
      ? {
          verified:
            `The camera is live and sending ${shown.sourceWidth}x${shown.sourceHeight} video. ` +
            'This step is done; no need to check it again.',
        }
      : {}),
  };
}

// ------------------------------------------------------------------ build helpers

async function addRole(
  ctx: Ctx,
  scene: SceneRef,
  it: BuildItem,
  canvas: Canvas,
  nextText: () => number,
  warnings: string[],
): Promise<void> {
  const sources = await ctx.resolver.sources();

  switch (it.role) {
    case 'background': {
      const name = `${scene.name} Background`;
      await ctx.commands.addSource(scene, name, 'color_source', {
        color: toObsColor(it.color ?? DEFAULT_BG),
        width: canvas[0],
        height: canvas[1],
      });
      // New scenes match the pattern the others already have.
      const pattern = findSource(sources, BACKGROUND_PATTERN_NAME);
      if (pattern) {
        await ctx.commands.addExistingSource(scene, pattern.sourceId);
        await waitForItem(ctx, scene, BACKGROUND_PATTERN_NAME, false);
      }
      return;
    }

    case 'sticker': {
      const emoji = (it.emoji ?? it.text ?? '').trim();
      const count = graphemes(emoji).length;
      if (!count) {
        throw new Error('A sticker needs "emoji", e.g. {"role": "sticker", "emoji": "🌸"}.');
      }
      if (count > 3) throw new Error('A sticker holds at most 3 emoji; add more stickers instead.');
      const prefix = `${scene.name} Sticker `;
      const existing = (await sceneDetail(ctx, scene)).filter(
        i => i.display === 'horizontal' && i.name.startsWith(prefix),
      );
      if (existing.length >= MAX_STICKERS_PER_SCENE) {
        throw new Error(`"${scene.name}" already has ${MAX_STICKERS_PER_SCENE} stickers.`);
      }
      let n = existing.length + 1;
      while (findSource(sources, `${prefix}${n}`)) n++;
      const name = `${prefix}${n}`;
      const px = STICKER_SIZES[it.size ?? 'medium'];
      const animation: StickerAnimation = it.animate ?? 'none';
      const page = textAsset('sticker', { emoji, animation, v: 1 }, 'html', () =>
        stickerPage(emoji, animation),
      );
      await ctx.commands.addSource(scene, name, 'browser_source', {
        is_local_file: true,
        local_file: page,
        width: Math.round(px * (1 + (count - 1) * 0.85)),
        height: px,
        fps: 30,
        // Paused while its scene is not showing, so stickers cost nothing off screen.
        shutdown: true,
        reroute_audio: false,
        css: '',
      });
      const item = await waitForItem(ctx, scene, name, true, 20);
      const at = await placeClear(ctx, scene, item, canvas, it.anchor);
      if (it.anchor && at !== it.anchor) {
        warnings.push(`Sticker ${emoji} went to ${at}: ${it.anchor} would cover something.`);
      }
      return;
    }

    case 'game': {
      const existing = findSource(sources, GAME_CAPTURE_NAME);
      if (existing) await ctx.commands.addExistingSource(scene, existing.sourceId);
      else {
        await ctx.commands.addSource(
          scene,
          GAME_CAPTURE_NAME,
          'game_capture',
          gameCaptureSettings(it.game),
        );
      }
      const item = await waitForItem(ctx, scene, GAME_CAPTURE_NAME, false);
      await ctx.commands.stretchToScreen(scene, toItemRef(item));
      return;
    }

    case 'webcam': {
      // The camera on screen now: after an NVIDIA Broadcast switch that is the NVIDIA source,
      // and the original camera must stay released (NVIDIA Broadcast is using the device).
      let existing = (await liveCamera(ctx)) ?? sources.find(s => s.type === 'dshow_input');
      if (existing) {
        await ctx.commands.addExistingSource(scene, existing.sourceId);
      } else {
        const dev = await initialWebcamDevice(ctx);
        if (!dev) warnings.push('No camera device was found for the webcam.');
        await ctx.commands.addSource(
          scene,
          WEBCAM_NAME,
          'dshow_input',
          // deactivate_when_not_showing: hiding the webcam everywhere releases the camera,
          // which NVIDIA Broadcast needs before it can change effects.
          dev
            ? { video_device_id: dev.value, deactivate_when_not_showing: true }
            : { deactivate_when_not_showing: true },
        );
        ctx.resolver.invalidate();
        existing = findSource(await ctx.resolver.sources(), WEBCAM_NAME);
      }
      const camName = existing?.name ?? WEBCAM_NAME;
      // Cameras can take several seconds to deliver a first frame.
      const item = await waitForItem(ctx, scene, camName, true, 30);
      await place(ctx, scene, item, canvas, {
        anchor: it.anchor ?? 'bottom-right',
        widthPercent: it.width_percent ?? 25,
        flush: it.flush,
      });
      return;
    }

    case 'alerts': {
      await addAlertBox(ctx, scene, sources, it, canvas);
      return;
    }

    case 'text': {
      const n = nextText();
      const name = n === 1 ? `${scene.name} Text` : `${scene.name} Text ${n}`;
      const words = cleanText(it.text ?? '') || scene.name;
      const emoji = emojiIn(it.text ?? '');
      if (emoji) warnings.push(emojiNote(scene.name, emoji));
      await ctx.commands.addSource(scene, name, 'text_gdiplus', {
        text: words,
        font: { face: DEFAULT_FONT, size: TEXT_SIZE_PX[it.size ?? 'large'], style: '', flags: 0 },
        color: toObsColor(it.color ?? '#ffffff'),
        opacity: 100,
        align: 'center',
        ...TEXT_EFFECT_DEFAULTS,
      });
      const item = await waitForItem(ctx, scene, name, true);
      await place(ctx, scene, item, canvas, { anchor: it.anchor ?? 'center' });
      await fitText(ctx, scene, name, canvas);
      return;
    }
  }
}

/** Move a just-added background/game item to the bottom of the stack (game above background). */
async function sendToBack(ctx: Ctx, scene: SceneRef, role: 'background' | 'game'): Promise<void> {
  ctx.resolver.invalidate();
  const items = (await sceneDetail(ctx, scene)).filter(i => i.display === 'horizontal');
  const bgName = `${scene.name} Background`;
  const item =
    role === 'game'
      ? items.find(i => i.type === 'game_capture')
      : items.find(i => i.name === bgName);
  if (!item) return;
  const bg = items.find(i => i.name === bgName);
  const bottom = items[items.length - 1];
  if (role === 'game' && bg && bg.sceneItemId !== item.sceneItemId) {
    await ctx.commands.reorder(scene, toItemRef(item), bg.sceneItemId, 'before');
  } else if (bottom && bottom.sceneItemId !== item.sceneItemId) {
    await ctx.commands.reorder(scene, toItemRef(item), bottom.sceneItemId, 'after');
  }
}

/**
 * The Streamlabs Alert Box widget. WidgetsService.createWidget only adds to the ACTIVE scene
 * (and returns nothing when logged out), so: reuse an existing Alert Box source, or create one
 * and move it into the target scene -- without ever switching scenes on the streamer.
 */
async function addAlertBox(
  ctx: Ctx,
  scene: SceneRef,
  sources: SourceRef[],
  it: BuildItem,
  canvas: Canvas,
): Promise<void> {
  let src = sources.find(s => s.name.startsWith(ALERT_BOX_NAME) && s.type === 'browser_source');
  if (src) {
    await ctx.commands.addExistingSource(scene, src.sourceId);
  } else {
    const active = await ctx.resolver.activeScene();
    const created = await ctx.client.request<unknown>('WidgetsService', 'createWidget', [
      WIDGET_TYPE_ALERT_BOX,
      ALERT_BOX_NAME,
    ]);
    if (!created) {
      throw new Error(
        'Streamlabs did not create the Alert Box. Alert widgets need a logged-in Streamlabs ' +
          'account: log in from the Streamlabs window, then try again.',
      );
    }
    ctx.resolver.invalidate();
    src = (await ctx.resolver.sources()).find(s => s.name.startsWith(ALERT_BOX_NAME));
    if (!src) throw new Error('Created the Alert Box but cannot find it.');
    if (active.id !== scene.id) {
      const id = src.sourceId;
      await ctx.commands.addExistingSource(scene, id);
      const stray = (await sceneDetail(ctx, active)).filter(i => i.sourceId === id);
      for (const s of stray) await ctx.commands.removeItem(active, toItemRef(s));
    }
  }
  const item = await waitForItem(ctx, scene, src.name, false);
  await place(ctx, scene, item, canvas, {
    anchor: it.anchor ?? 'top-center',
    widthPercent: it.width_percent ?? 40,
  });
}

/**
 * Make a text item readable wherever the model put it: shrink it to the title-safe width, and
 * if it overlaps the webcam, move it into the largest free area beside, above or below the
 * webcam (shrinking to fit). Lets the model choose layouts freely without collisions.
 */
async function fitText(ctx: Ctx, scene: SceneRef, name: string, canvas: Canvas): Promise<void> {
  ctx.resolver.invalidate();
  const items = (await sceneDetail(ctx, scene)).filter(i => i.display === 'horizontal');
  const item = items.find(i => i.name === name);
  if (!item || item.sourceWidth <= 0 || item.sourceHeight <= 0) return;

  const M = TITLE_SAFE_MARGIN;
  const [cw, ch] = canvas;
  const srcW = item.sourceWidth;
  const srcH = item.sourceHeight;
  let s = item.transform.scale.x || 1;
  let cx = item.rect.x + item.rect.width / 2;
  let cy = item.rect.y + item.rect.height / 2;

  // 1) never wider than the title-safe width
  s = Math.min(s, (cw - 2 * M) / srcW);

  // 2) stay clear of the webcam (plus its frame)
  const pad = FRAME_THICKNESS + 16;
  const cams = items.filter(i => i.type === 'dshow_input' && i.visible && i.rect.width > 0);
  const box = () => ({ x: cx - (srcW * s) / 2, y: cy - (srcH * s) / 2, w: srcW * s, h: srcH * s });
  const hits = (b: { x: number; y: number; w: number; h: number }, c: ItemDetail) =>
    b.x < c.rect.x + c.rect.width + pad &&
    b.x + b.w > c.rect.x - pad &&
    b.y < c.rect.y + c.rect.height + pad &&
    b.y + b.h > c.rect.y - pad;

  const cam = cams.find(c => hits(box(), c));
  if (cam) {
    const c = cam.rect;
    const regions = [
      { side: 'above', x: M, y: M, w: cw - 2 * M, h: c.y - pad - M },
      {
        side: 'below',
        x: M,
        y: c.y + c.height + pad,
        w: cw - 2 * M,
        h: ch - M - (c.y + c.height + pad),
      },
      { side: 'left', x: M, y: M, w: c.x - pad - M, h: ch - 2 * M },
      {
        side: 'right',
        x: c.x + c.width + pad,
        y: M,
        w: cw - M - (c.x + c.width + pad),
        h: ch - 2 * M,
      },
    ].filter(r => r.w > 40 && r.h > 20);

    let best: { s: number; cx: number; cy: number } | null = null;
    for (const r of regions) {
      const rs = Math.min(s, r.w / srcW, r.h / srcH);
      const h = srcH * rs;
      const rcx = r.x + r.w / 2;
      // Beside the webcam: keep the text's height if it fits; above/below: center in the gap.
      const rcy =
        r.side === 'left' || r.side === 'right'
          ? Math.min(Math.max(cy, r.y + h / 2), r.y + r.h - h / 2)
          : r.y + r.h / 2;
      if (!best || rs > best.s * 1.05) best = { s: rs, cx: rcx, cy: rcy };
    }
    if (best) ({ s, cx, cy } = best);
  }

  const b = box();
  const unchanged =
    Math.abs(s - (item.transform.scale.x || 1)) < 1e-3 &&
    Math.abs(b.x - item.rect.x) < 1 &&
    Math.abs(b.y - item.rect.y) < 1;
  if (unchanged) return;
  await ctx.client.request(item.resourceId, 'setTransform', [
    { position: { x: Math.round(b.x), y: Math.round(b.y) }, scale: { x: s, y: s } },
  ]);
}

const FRAME_THICKNESS = 10;
const FRAME_SIDES = ['Top', 'Bottom', 'Left', 'Right'] as const;

/**
 * An accent outline around the webcam, built from four thin color strips so the inside stays
 * see-through. (A single block behind the webcam would show through as a solid box once the
 * camera's background is removed.)
 */
/** The accent already in use: the webcam frame's color, else any text outline's. */
async function currentAccent(ctx: Ctx): Promise<number | undefined> {
  const sources = await ctx.resolver.sources();
  const strip = sources.find(src => src.type === 'color_source' && FRAME_STRIP_RE.test(src.name));
  if (strip) {
    const c = (await settingsOf(ctx, strip.sourceId)).color;
    if (typeof c === 'number') return c;
  }
  const texts = sources.filter(src => src.type.startsWith('text_gdiplus'));
  for (const t of texts) {
    const st = await settingsOf(ctx, t.sourceId);
    if (st.outline && typeof st.outline_color === 'number') return st.outline_color;
  }
  return undefined;
}

/** Remove the frame strips from a scene in one go. Returns how many strips were removed. */
export async function removeWebcamFrame(ctx: Ctx, scene: SceneRef): Promise<number> {
  const strips = (await sceneDetail(ctx, scene)).filter(i => FRAME_STRIP_RE.test(i.name));
  for (const s of strips) await ctx.commands.removeItem(scene, toItemRef(s));
  return strips.length;
}

/**
 * Call after the webcam moved or resized in a scene: give every hidden camera copy the same
 * geometry (so a later set_camera keeps it), and re-wrap the frame around the live webcam.
 */
export async function afterWebcamChange(ctx: Ctx, scene: SceneRef): Promise<void> {
  ctx.resolver.invalidate();
  const items = (await sceneDetail(ctx, scene)).filter(i => i.display === 'horizontal');
  const live = items.find(i => i.type === 'dshow_input' && i.visible);
  if (!live) return;

  for (const other of items) {
    if (other.type !== 'dshow_input' || other.sceneItemId === live.sceneItemId) continue;
    const scale =
      other.sourceWidth > 0 && live.rect.width > 0
        ? live.rect.width / other.sourceWidth
        : live.transform.scale.x;
    await ctx.client.request(other.resourceId, 'setTransform', [
      { position: { ...live.transform.position }, scale: { x: scale, y: scale } },
    ]);
  }

  const strip = items.find(i => FRAME_STRIP_RE.test(i.name));
  if (strip) {
    const color = (await settingsOf(ctx, strip.sourceId)).color ?? toObsColor('#f472b6');
    await upsertWebcamFrame(ctx, scene, live, color);
  }

  // A bigger or moved webcam can now cover text: move/shrink text out of its way.
  const canvas = await canvasOf(ctx);
  for (const t of items.filter(i => i.type.startsWith('text_gdiplus'))) {
    await fitText(ctx, scene, t.name, canvas);
  }
}

async function upsertWebcamFrame(
  ctx: Ctx,
  scene: SceneRef,
  cam: ItemDetail,
  color: number,
): Promise<void> {
  const t = FRAME_THICKNESS;
  const { x, y, width: w, height: h } = cam.rect;
  const boxes: Record<
    typeof FRAME_SIDES[number],
    { x: number; y: number; w: number; h: number }
  > = {
    Top: { x: x - t, y: y - t, w: w + 2 * t, h: t },
    Bottom: { x: x - t, y: y + h, w: w + 2 * t, h: t },
    Left: { x: x - t, y, w: t, h },
    Right: { x: x + w, y, w: t, h },
  };

  for (const side of FRAME_SIDES) {
    const name = `${scene.name} Webcam Frame ${side}`;
    const b = boxes[side];
    const width = Math.max(1, Math.round(b.w));
    const height = Math.max(1, Math.round(b.h));

    const items = await sceneDetail(ctx, scene);
    let strip = items.find(i => i.name === name && i.display === 'horizontal');
    if (strip) {
      await ctx.commands.setSourceSettings(strip.sourceId, { color, width, height });
    } else {
      await ctx.commands.addSource(scene, name, 'color_source', { color, width, height });
      strip = await waitForItem(ctx, scene, name, false);
    }
    await ctx.commands.setItemTransform(
      scene,
      toItemRef(strip),
      { position: { x: Math.round(b.x), y: Math.round(b.y) }, scale: { x: 1, y: 1 } },
      { position: strip.transform.position, scale: strip.transform.scale },
    );
  }
}
