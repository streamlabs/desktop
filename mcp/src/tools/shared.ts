/**
 * Shared plumbing for the tool groups.
 *
 * Tool files are split by PERMISSION GROUP, not by domain, because that split is what a
 * user picks from at `hermes mcp install` -- the checklist writes into `tools.include`, so
 * the tool boundaries are the permission boundaries.
 */

import * as z from 'zod/v4';
import { DesktopClient } from '../desktop/client.js';
import { Resolver, SceneRef } from '../desktop/resolver.js';
import { SnapshotBuilder } from '../desktop/snapshot.js';
import { EventBuffer } from '../desktop/events.js';
import { Commands } from '../desktop/commands.js';
import { Confirmer } from '../confirm.js';
import { redact } from '../desktop/redact.js';
import { Rect, rect } from '../layout/geometry.js';
import { log } from '../log.js';

export interface Ctx {
  client: DesktopClient;
  resolver: Resolver;
  snapshot: SnapshotBuilder;
  events: EventBuffer;
  commands: Commands;
  confirm: Confirmer;
}

/**
 * Widened beyond text to carry image blocks. Nothing emits images yet -- capture is a later
 * phase -- but the shape is here so adding one does not touch every tool.
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export type ToolResult = {
  content: ContentBlock[];
  isError?: boolean;
};

export function ok(payload: unknown): ToolResult {
  const { value, redactedFields } = redact(payload);
  const body =
    redactedFields > 0 && value && typeof value === 'object'
      ? { ...(value as Record<string, unknown>), redactedFields }
      : value;
  return { content: [{ type: 'text', text: JSON.stringify(body, null, 1) }] };
}

export function text(s: string): ToolResult {
  return { content: [{ type: 'text', text: s }] };
}

export function fail(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Every tool body goes through this so a dead app reads as advice, not a crash. */
export async function guard(label: string, fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`tool ${label} failed: ${msg}`);
    return fail(msg);
  }
}

/**
 * The provenance parameter the whole confirmation model rests on. The wording matters --
 * this description is the only thing telling the agent how to classify its own intent.
 */
export const requestedBy = z
  .enum(['user', 'agent'])
  .optional()
  .describe(
    'Who asked for this. Use "user" ONLY when the streamer directly requested this specific ' +
      'action (spoken or typed) — it then happens immediately with no prompt. Use "agent" (the ' +
      'default) when you are suggesting it yourself, including when acting on a standing ' +
      'instruction or something you inferred; the streamer will be shown a confirmation. ' +
      'When in doubt, omit this.',
  );

export interface ItemDetail {
  name: string;
  sceneItemId: string;
  sourceId: string;
  resourceId: string;
  type: string;
  visible: boolean;
  locked: boolean;
  rect: Rect;
  transform: {
    position: { x: number; y: number };
    scale: { x: number; y: number };
    rotation: number;
    crop: { top: number; bottom: number; left: number; right: number };
  };
  /** Source size after crop -- what scale 1 would render. */
  sourceWidth: number;
  sourceHeight: number;
  /**
   * Dual output puts a horizontal and a vertical copy of every node in the same scene, both
   * carrying the SAME name. Treating them as interchangeable duplicates would lay vertical
   * nodes out against the horizontal canvas, so they are distinguished here and the layout
   * tools operate on horizontal nodes only.
   */
  display: 'horizontal' | 'vertical';
}

interface SceneModelNode {
  sceneNodeType?: string;
  sceneItemId?: string;
  id?: string;
  name?: string;
  sourceId?: string;
  visible?: boolean;
  locked?: boolean;
  resourceId?: string;
  display?: string;
  transform?: {
    position?: { x?: number; y?: number };
    scale?: { x?: number; y?: number };
    rotation?: number;
    crop?: { top?: number; bottom?: number; left?: number; right?: number };
  };
}

const ZERO_CROP = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * Every item in a scene with its geometry, in ONE round trip.
 *
 * `Scene.getModel()` returns each node's full model including transforms, so this avoids the
 * N+1 getModel() pattern. It is not @Expensive -- only ScenesService.getScenes and
 * SceneCollectionsService.fetchSceneCollectionsSchema carry a rate-limit cost.
 */
export async function sceneDetail(ctx: Ctx, scene: SceneRef): Promise<ItemDetail[]> {
  const [model, sources] = await Promise.all([
    ctx.client.request<{ nodes?: SceneModelNode[] }>(scene.resourceId, 'getModel'),
    ctx.resolver.sources(),
  ]);

  const byId = new Map(sources.map(s => [s.sourceId, s]));

  return (model?.nodes ?? [])
    .filter(n => n.sceneNodeType !== 'folder')
    .map(n => {
      const src = byId.get(String(n.sourceId ?? ''));
      const t = n.transform ?? {};
      const crop = { ...ZERO_CROP, ...(t.crop ?? {}) };
      const scale = { x: t.scale?.x ?? 1, y: t.scale?.y ?? 1 };
      const position = { x: t.position?.x ?? 0, y: t.position?.y ?? 0 };

      const sourceWidth = Math.max(0, (src?.width ?? 0) - crop.left - crop.right);
      const sourceHeight = Math.max(0, (src?.height ?? 0) - crop.top - crop.bottom);

      const sceneItemId = String(n.sceneItemId ?? n.id ?? '');

      return {
        name: String(n.name ?? src?.name ?? '(unnamed)'),
        sceneItemId,
        sourceId: String(n.sourceId ?? ''),
        resourceId:
          n.resourceId ?? `SceneItem["${scene.id}", "${sceneItemId}", "${n.sourceId ?? ''}"]`,
        type: src?.type ?? 'unknown',
        visible: !!n.visible,
        locked: !!n.locked,
        rect: rect(position.x, position.y, sourceWidth * scale.x, sourceHeight * scale.y),
        transform: { position, scale, rotation: t.rotation ?? 0, crop },
        sourceWidth,
        sourceHeight,
        display: n.display === 'vertical' ? 'vertical' : 'horizontal',
      };
    });
}

/**
 * Names first, id as the escape hatch.
 *
 * Human names are the point of this server -- they are cheap and the model gets them right.
 * But scene collections legitimately contain items sharing a name (dual output alone puts a
 * horizontal and a vertical copy of everything in the same scene), and a name that matches
 * two items is genuinely ambiguous. Rather than inventing a positional convention, fall back
 * to `sceneItemId`, which already exists, is stable across reordering, and is what get_scene
 * emits for duplicated names.
 */
function ambiguous(matches: ItemDetail[], needle: string, sceneName: string): Error {
  const list = matches
    .map(
      m =>
        `{ id: "${m.sceneItemId}", display: "${m.display}", rect: [${m.rect.x}, ${m.rect.y}, ${m.rect.width}, ${m.rect.height}]${m.visible ? '' : ', hidden'} }`,
    )
    .join(', ');
  return new Error(
    `"${needle}" matches ${matches.length} items in scene "${sceneName}". Pass one of these ` +
      `ids as \`item\` instead of the name: ${list}`,
  );
}

export function findItem(items: ItemDetail[], name: string, sceneName: string): ItemDetail {
  const raw = name.trim();

  const byId = items.find(i => i.sceneItemId === raw);
  if (byId) return byId;

  const exact = items.filter(i => i.name === raw);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw ambiguous(exact, raw, sceneName);

  const ci = items.filter(i => i.name.toLowerCase() === raw.toLowerCase());
  if (ci.length === 1) return ci[0];
  if (ci.length > 1) throw ambiguous(ci, raw, sceneName);

  const sub = items.filter(i => i.name.toLowerCase().includes(raw.toLowerCase()));
  if (sub.length === 1) return sub[0];
  if (sub.length > 1) throw ambiguous(sub, raw, sceneName);

  throw new Error(
    `No item named "${name}" in scene "${sceneName}". Available: ` +
      `${JSON.stringify([...new Set(items.map(i => i.name))])}.`,
  );
}

/** Whether the change is going out to viewers right now. Used only to word warnings. */
export async function liveContext(
  ctx: Ctx,
  sceneName: string,
): Promise<{ live: boolean; onAir: boolean }> {
  try {
    const snap = await ctx.snapshot.build({ maxAgeMs: 2000 });
    const live = snap.stream.status === 'live';
    return { live, onAir: live && snap.activeScene.name === sceneName };
  } catch {
    return { live: false, onAir: false };
  }
}

export function liveWarnings(onAir: boolean, what: string): string[] {
  return onAir ? [`You are LIVE and ${what} is in the active scene — viewers see this immediately.`] : [];
}

/** Attach the undo entry to a result so the agent can offer to take it back. */
export function withUndo<T extends Record<string, unknown>>(
  payload: T,
  edit: { undo: string | null },
): T & { undo: string } {
  return {
    ...payload,
    undo: `Reversible — Ctrl+Z in Streamlabs${edit.undo ? ` ("${edit.undo}")` : ''}, or the undo_last_edit tool.`,
  };
}
