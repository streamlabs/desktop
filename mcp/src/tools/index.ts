/**
 * M0 tool surface: 5 tools.
 *
 * Design rules (see mcp/README.md):
 *  - Tools take HUMAN NAMES, never resourceIds.
 *  - One fat read per turn (get_stream_state), everything else is a drill-down.
 *  - Group by annotation class -- a tool never mixes read-only and destructive work.
 *
 * NOTE ON SAFETY: M0 has no gating. Reads are safe and the three writes here are all
 * reversible (scene switch, visibility, volume). Destructive tools and the confirm-token
 * gate arrive in M2 -- do not add remove/go-live tools to this file without them.
 */

import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DesktopClient } from '../desktop/client.js';
import { Resolver } from '../desktop/resolver.js';
import { SnapshotBuilder } from '../desktop/snapshot.js';
import { redact } from '../desktop/redact.js';
import { log } from '../log.js';

export interface Ctx {
  client: DesktopClient;
  resolver: Resolver;
  snapshot: SnapshotBuilder;
}

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function ok(payload: unknown): ToolResult {
  const { value, redactedFields } = redact(payload);
  const body =
    redactedFields > 0 && value && typeof value === 'object'
      ? { ...(value as Record<string, unknown>), redactedFields }
      : value;
  return { content: [{ type: 'text', text: JSON.stringify(body, null, 1) }] };
}

function fail(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Every tool body goes through this so a dead app reads as advice, not a crash. */
async function guard(label: string, fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`tool ${label} failed: ${msg}`);
    return fail(msg);
  }
}

export function registerTools(server: McpServer, ctx: Ctx): void {
  // ------------------------------------------------------------------ reads

  server.registerTool(
    'get_stream_state',
    {
      title: 'Get stream state',
      description:
        'Snapshot of everything happening in Streamlabs Desktop right now: streaming/recording ' +
        'status, stream health (CPU, fps, dropped/skipped/lagged frames, an overall verdict), the ' +
        'scene list, every item in the active scene with its on-canvas rectangle [x, y, width, ' +
        'height], audio sources with mute state and volume, events since your last call, and ' +
        'automatically-detected warnings. CALL THIS FIRST in any session and again after making ' +
        'changes. You cannot see the rendered output, so this is your only view of the stream.',
      inputSchema: {
        maxAgeMs: z
          .number()
          .optional()
          .describe('Serve a cached snapshot if it is younger than this (default 750ms). Pass 0 to force a fresh read.'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ maxAgeMs }) =>
      guard('get_stream_state', async () => ok(await ctx.snapshot.build({ maxAgeMs }))),
  );

  server.registerTool(
    'get_scene',
    {
      title: 'Get scene details',
      description:
        'Full item list for one scene by name, including each item\'s on-canvas rectangle, ' +
        'visibility, lock state and source type. Use this to inspect a scene that is not active, ' +
        'or to verify a layout change you just made — you cannot see the rendered output.',
      inputSchema: {
        scene: z.string().describe('Scene name. Omit or leave empty for the active scene.').optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ scene }) =>
      guard('get_scene', async () => {
        const ref = await ctx.resolver.resolveScene(scene);
        const [items, sources] = await Promise.all([
          ctx.resolver.sceneItems(ref),
          ctx.resolver.sources(),
        ]);
        const byId = new Map(sources.map(s => [s.sourceId, s]));
        const detail = await Promise.all(
          items.map(async i => {
            const model = await ctx.client.request<Record<string, unknown>>(i.resourceId, 'getModel');
            const src = byId.get(i.sourceId);
            const t = (model?.transform ?? {}) as any;
            const crop = t.crop ?? { top: 0, bottom: 0, left: 0, right: 0 };
            const w = Math.max(0, (src?.width ?? 0) - crop.left - crop.right) * (t.scale?.x ?? 1);
            const h = Math.max(0, (src?.height ?? 0) - crop.top - crop.bottom) * (t.scale?.y ?? 1);
            return {
              name: i.name,
              type: src?.type ?? 'unknown',
              visible: !!model?.visible,
              locked: !!model?.locked,
              rect: [
                Math.round(t.position?.x ?? 0),
                Math.round(t.position?.y ?? 0),
                Math.round(w),
                Math.round(h),
              ],
              rotation: t.rotation ?? 0,
            };
          }),
        );
        return ok({ scene: ref.name, items: detail });
      }),
  );

  // ----------------------------------------------------------- safe writes

  server.registerTool(
    'switch_scene',
    {
      title: 'Switch active scene',
      description:
        'Make a scene the active (live) scene by name. This is immediately visible to viewers if ' +
        'you are streaming. Returns the new state plus any warnings — for example if the scene ' +
        'you switched to is empty or has everything hidden, which renders as a black screen.',
      inputSchema: { scene: z.string().describe('Name of the scene to switch to.') },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ scene }) =>
      guard('switch_scene', async () => {
        const ref = await ctx.resolver.resolveScene(scene);

        // Cheap pre-flight: a blind agent switching to an empty scene means a black
        // screen to every viewer. Not a refusal in M0, but say so loudly.
        const items = await ctx.resolver.sceneItems(ref);
        const warnings: string[] = [];
        if (items.length === 0) {
          warnings.push(`"${ref.name}" has no items — this will render as a black screen.`);
        }

        await ctx.client.request('ScenesService', 'makeSceneActive', [ref.id]);
        ctx.snapshot.invalidate();
        return ok({
          switched: true,
          resolved: { scene: ref.name, resourceId: ref.resourceId },
          itemCount: items.length,
          warnings,
        });
      }),
  );

  server.registerTool(
    'set_item_visibility',
    {
      title: 'Show or hide a scene item',
      description:
        'Show or hide one item in a scene, by name. Reversible. If the scene is live this is ' +
        'immediately visible to viewers.',
      inputSchema: {
        item: z.string().describe('Name of the scene item, e.g. "Webcam".'),
        visible: z.boolean().describe('true to show, false to hide.'),
        scene: z.string().optional().describe('Scene name. Defaults to the active scene.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ item, visible, scene }) =>
      guard('set_item_visibility', async () => {
        const { scene: sceneRef, item: itemRef } = await ctx.resolver.resolveItem(item, scene);
        await ctx.client.request(itemRef.resourceId, 'setVisibility', [visible]);
        ctx.snapshot.invalidate();
        return ok({
          updated: true,
          visible,
          resolved: { scene: sceneRef.name, item: itemRef.name, resourceId: itemRef.resourceId },
        });
      }),
  );

  server.registerTool(
    'set_audio',
    {
      title: 'Set audio mute or volume',
      description:
        'Mute/unmute an audio source and/or set its volume, by source name (e.g. "Mic/Aux", ' +
        '"Desktop Audio"). Volume is 0.0–1.0 on the fader scale shown in the mixer. Reversible.',
      inputSchema: {
        source: z.string().describe('Audio source name, e.g. "Mic/Aux".'),
        muted: z.boolean().optional().describe('true to mute, false to unmute.'),
        volume: z.number().min(0).max(1).optional().describe('Fader deflection, 0.0 to 1.0.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ source, muted, volume }) =>
      guard('set_audio', async () => {
        if (muted === undefined && volume === undefined) {
          return fail('Nothing to do: pass `muted`, `volume`, or both.');
        }
        const ref = await ctx.resolver.resolveAudioSource(source);
        if (muted !== undefined) await ctx.client.request(ref.resourceId, 'setMuted', [muted]);
        if (volume !== undefined) await ctx.client.request(ref.resourceId, 'setDeflection', [volume]);
        ctx.snapshot.invalidate();
        return ok({
          updated: true,
          ...(muted !== undefined ? { muted } : {}),
          ...(volume !== undefined ? { volume } : {}),
          resolved: { source: ref.name, resourceId: ref.resourceId },
        });
      }),
  );
}
