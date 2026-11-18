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
  if (/^[0-9a-f]{3}$/.test(s))
    s = s
      .split('')
      .map(c => c + c)
      .join('');
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

const ROLES = ['background', 'game', 'webcam', 'text', 'alerts'] as const;
type Role = typeof ROLES[number];

/** Bottom-to-top stacking. New items land on top, so adding in this order stacks correctly. */
const LAYER: Record<Role, number> = { background: 0, game: 1, webcam: 2, text: 3, alerts: 4 };

const TEXT_SIZES = { small: 48, medium: 80, large: 120 } as const;

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
    .describe(
      'background = full-screen color block; game = game capture (shared by all scenes); ' +
        'webcam = your camera (shared by all scenes); text = a text label; alerts = the ' +
        'Streamlabs Alert Box widget (follows, subs, donations pop up here).',
    ),
  text: z.string().optional().describe('For role "text": the words to show.'),
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
    .describe('Webcam width as % of the screen. Default 25 (100 = full screen).'),
  size: z.enum(['small', 'medium', 'large']).optional().describe('For role "text". Default large.'),
  flush: z
    .boolean()
    .optional()
    .describe('For role "webcam": true = right against the screen edge/corner, no margin.'),
});
type BuildItem = z.infer<typeof itemSchema>;

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
        'the same ones. Example: {"name": "Gameplay", "items": [{"role": "game", "game": ' +
        '"<the game>"}, {"role": "webcam", "anchor": "bottom-right", "width_percent": 25}]}.',
      inputSchema: {
        name: z.string().describe('Scene name, e.g. "Starting Soon".'),
        items: z.array(itemSchema).min(1).describe('What goes in the scene, by role.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ name: rawName, items, requested_by }) =>
      guard('build_scene', () =>
        serial(async () => {
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
                  `name, or change this scene with apply_style / set_item_transform.`,
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
    async ({ scene, items, requested_by }) =>
      guard('add_to_scene', () =>
        serial(async () => {
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
        'Change the look of every scene in ONE call: background color, text color and font, ' +
        'and an accent-colored frame around the webcam. Pass only what should change. ' +
        'Example: {"background_color": "#0f172a", "accent_color": "#22d3ee", "text_color": ' +
        '"#f0abfc", "font": "Segoe UI Black"}. Good fonts: "Segoe ' +
        'Print" (cute, handwritten), "Comic Sans MS" (playful), "Ink Free" (marker), ' +
        '"Segoe UI Black" (bold, clean).',
      inputSchema: {
        background_color: colorParam('Background fill'),
        accent_color: colorParam('Accent: webcam frame and text outline'),
        text_color: colorParam('Text color'),
        font: z.string().optional().describe('Font name for all text, e.g. "Segoe Print".'),
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
      accent_color,
      text_color,
      font,
      webcam_frame,
      scenes,
      requested_by,
    }) =>
      guard('apply_style', () =>
        serial(async () => {
          if (
            !background_color &&
            !accent_color &&
            !text_color &&
            !font &&
            webcam_frame === undefined
          ) {
            return fail(
              'Nothing to change: pass background_color, accent_color, text_color, font and/or webcam_frame.',
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
          const refit: Array<{ scene: SceneRef; name: string }> = [];

          const all = await ctx.resolver.sceneList();
          const targets = scenes?.length
            ? scenes.map(n => {
                const s = all.find(x => x.name.toLowerCase() === n.toLowerCase());
                if (!s)
                  throw new Error(
                    `No scene named "${n}". Scenes: ${JSON.stringify(all.map(x => x.name))}.`,
                  );
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

          for (const scene of targets) {
            const items = (await sceneDetail(ctx, scene)).filter(i => i.display === 'horizontal');

            for (const item of items) {
              if (touchedSources.has(item.sourceId)) continue;
              const isFrame = FRAME_STRIP_RE.test(item.name);

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
                (fg !== undefined || font || accent !== undefined)
              ) {
                const current = await settingsOf(ctx, item.sourceId);
                const patch: Record<string, unknown> = {};
                if (fg !== undefined) patch.color = fg;
                if (font)
                  patch.font = {
                    ...(current.font ?? {}),
                    face: font,
                    size: current.font?.size ?? 80,
                  };
                if (accent !== undefined) {
                  patch.outline = true;
                  patch.outline_color = accent;
                  patch.outline_size = 8;
                }
                await ctx.commands.setSourceSettings(item.sourceId, patch);
                touchedSources.add(item.sourceId);
                changed.push(`${scene.name}: ${item.name} text style`);
                refit.push({ scene, name: item.name });
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

          // A new font can make text wider than the screen; shrink any that overflow.
          if (refit.length) await sleep(400);
          for (const r of refit) await fitText(ctx, r.scene, r.name, canvas);

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
  if (!withCam.length)
    throw new Error('No scene shows the webcam. Add one with build_scene first.');

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
  return {
    updated: true,
    camera: match.description,
    scenes: withCam.map(w => w.scene.name),
    note: `The webcam in every scene now shows the ${match.description} camera.`,
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
      return;
    }

    case 'game': {
      const existing = findSource(sources, GAME_CAPTURE_NAME);
      if (existing) await ctx.commands.addExistingSource(scene, existing.sourceId);
      else
        await ctx.commands.addSource(
          scene,
          GAME_CAPTURE_NAME,
          'game_capture',
          gameCaptureSettings(it.game),
        );
      const item = await waitForItem(ctx, scene, GAME_CAPTURE_NAME, false);
      await ctx.commands.stretchToScreen(scene, toItemRef(item));
      return;
    }

    case 'webcam': {
      let existing = sources.find(s => s.type === 'dshow_input');
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
      // GDI+ text renders emoji as empty boxes; strip them.
      const words =
        (it.text ?? '')
          .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍⃣]/gu, '')
          .replace(/s{2,}/g, ' ')
          .trim() || scene.name;
      await ctx.commands.addSource(scene, name, 'text_gdiplus', {
        text: words,
        font: { face: DEFAULT_FONT, size: TEXT_SIZES[it.size ?? 'large'], style: '', flags: 0 },
        color: toObsColor(it.color ?? '#ffffff'),
        opacity: 100,
        align: 'center',
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
/** The accent already in use: the outline color of any styled text source. */
async function currentAccent(ctx: Ctx): Promise<number | undefined> {
  const texts = (await ctx.resolver.sources()).filter(src => src.type.startsWith('text_gdiplus'));
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

    let items = await sceneDetail(ctx, scene);
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
