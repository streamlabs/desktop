/**
 * Reads. No confirmation, ever -- these change nothing.
 *
 * Note the one carve-out that does NOT live here: screen capture. A screenshot is a read of
 * the user's private screen rather than of app state, it bypasses redact.ts entirely (you
 * cannot regex a PNG), and it is therefore gated like a write. It is not part of this phase.
 */

import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Ctx, guard, ok, sceneDetail } from './shared.js';
import { inspectPlacement } from '../layout/geometry.js';

export function registerReads(server: McpServer, ctx: Ctx): void {
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
          .describe(
            'Serve a cached snapshot if it is younger than this (default 750ms). Pass 0 to force a fresh read.',
          ),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ maxAgeMs }) =>
      guard('get_stream_state', async () => ok(await ctx.snapshot.build({ maxAgeMs }))),
  );

  server.registerTool(
    'get_health',
    {
      title: 'Get stream health',
      description:
        'Slim health-only read for polling: stream/recording status, CPU, fps, dropped/skipped/' +
        'lagged frame percentages, bandwidth, an overall verdict, and any new warnings or events ' +
        'since the last call. Much cheaper than get_stream_state — use this for a monitoring ' +
        'loop and only escalate to the full state when something looks wrong.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () =>
      guard('get_health', async () => {
        const snap = await ctx.snapshot.build({ maxAgeMs: 1500 });
        return ok({
          stream: snap.stream.status,
          recording: snap.stream.recording,
          replayBuffer: snap.stream.replayBuffer,
          health: snap.health,
          activeScene: snap.activeScene.name,
          warnings: snap.warnings,
          ...(snap.newEvents?.length ? { newEvents: snap.newEvents } : {}),
        });
      }),
  );

  server.registerTool(
    'get_scene',
    {
      title: 'Get scene details',
      description:
        "Full item list for one scene by name, including each item's on-canvas rectangle, " +
        'visibility, lock state, source type and rotation, plus geometry notes (overlaps, ' +
        'off-canvas items, title-safe violations). Use this to inspect a scene that is not ' +
        'active, or to verify a layout change you just made — you cannot see the rendered output.',
      inputSchema: {
        scene: z
          .string()
          .optional()
          .describe('Scene name. Omit or leave empty for the active scene.'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ scene }) =>
      guard('get_scene', async () => {
        const ref = await ctx.resolver.resolveScene(scene);
        const [items, snap] = await Promise.all([
          sceneDetail(ctx, ref),
          ctx.snapshot.build({ maxAgeMs: 5000 }),
        ]);
        const canvas = snap.canvas;

        const others = items.filter(i => i.visible).map(i => ({ name: i.name, rect: i.rect }));
        const notes = items
          .filter(i => i.visible)
          .flatMap(i =>
            inspectPlacement(i.name, i.rect, canvas, others)
              .filter(n => !n.ok)
              .map(n => n.text),
          );

        // Emit sceneItemId only where the name is ambiguous. Names are the cheap, normal
        // way to address an item; the id is the escape hatch when one is not enough.
        const counts = new Map<string, number>();
        for (const i of items) counts.set(i.name, (counts.get(i.name) ?? 0) + 1);

        return ok({
          scene: ref.name,
          canvas,
          items: items.map(i => ({
            name: i.name,
            ...((counts.get(i.name) ?? 0) > 1 ? { id: i.sceneItemId } : {}),
            type: i.type,
            visible: i.visible,
            locked: i.locked,
            rect: [i.rect.x, i.rect.y, i.rect.width, i.rect.height],
            ...(i.transform.rotation ? { rotation: i.transform.rotation } : {}),
          })),
          ...([...counts.values()].some(n => n > 1)
            ? {
                addressing:
                  'Some names appear more than once. For those, pass the "id" value as `item` instead of the name.',
              }
            : {}),
          notes,
        });
      }),
  );

  server.registerTool(
    'list_source_types',
    {
      title: 'List available source types',
      description:
        'The source types this machine can actually create, with human-readable labels. Call ' +
        'this before add_source so you use a real type identifier rather than guessing one.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () =>
      guard('list_source_types', async () => {
        const raw = await ctx.client.request<Array<{ description?: string; value?: string }>>(
          'SourcesService',
          'getAvailableSourcesTypesList',
        );
        return ok({
          sourceTypes: (raw ?? [])
            .filter(t => t?.value)
            .map(t => ({ type: t.value, label: t.description ?? t.value })),
        });
      }),
  );

  server.registerTool(
    'preflight_check',
    {
      title: 'Check readiness to go live',
      description:
        'Pre-broadcast checklist: whether the active scene renders anything, whether the mic is ' +
        'muted, whether any item is off-canvas or zero-size, whether recording is configured, ' +
        'and current encoder health. Returns a ready flag plus a list of problems. Use this when ' +
        'asked "am I ready to stream?" rather than assembling the answer from get_stream_state.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () =>
      guard('preflight_check', async () => {
        const snap = await ctx.snapshot.build({ maxAgeMs: 0 });
        const problems: string[] = [...snap.warnings];

        const visible = snap.activeScene.items.filter(i => i.visible);
        if (visible.length === 0) {
          problems.push(`Active scene "${snap.activeScene.name}" shows nothing.`);
        }

        const mic = snap.audio.find(a => /mic|aux/i.test(a.name));
        if (!mic) problems.push('No microphone source found in the active scene.');
        else if (mic.muted) problems.push(`"${mic.name}" is muted.`);
        else if (mic.volume === 0) problems.push(`"${mic.name}" volume is at zero.`);

        if (snap.health.verdict !== 'GOOD') {
          problems.push(`Encoder health is ${snap.health.verdict} before going live.`);
        }

        return ok({
          ready: problems.length === 0,
          problems,
          activeScene: snap.activeScene.name,
          visibleItems: visible.map(i => i.name),
          audio: snap.audio,
          health: snap.health,
        });
      }),
  );
}
