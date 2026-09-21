/**
 * Live performance operations -- the things a streamer does *while* broadcasting rather
 * than edits to their scene collection.
 *
 * These are the tools most likely to be driven by voice mid-stream ("switch to BRB",
 * "clip that"), so the requested_by: 'user' path matters most here: it must be one call
 * and instant, with no prompt in the way.
 *
 * undo_last_edit lives in this group because it is the safety valve -- it should stay
 * available even for someone who enables only this group at install time.
 */

import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  Ctx,
  fail,
  findItem,
  guard,
  liveContext,
  liveWarnings,
  ok,
  requestedBy,
  sceneDetail,
  withUndo,
} from './shared.js';

export function registerPerformance(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'switch_scene',
    {
      title: 'Switch active scene',
      description:
        'Make a scene the active (live) scene by name. Immediately visible to viewers if you ' +
        'are streaming. Warns if the target scene is empty or entirely hidden, which renders ' +
        'as a black screen.',
      inputSchema: {
        scene: z.string().describe('Name of the scene to switch to.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ scene, requested_by }) =>
      guard('switch_scene', async () => {
        const ref = await ctx.resolver.resolveScene(scene);
        const items = await ctx.resolver.sceneItems(ref);

        const warnings: string[] = [];
        if (items.length === 0) {
          warnings.push(`"${ref.name}" has no items — this will render as a black screen.`);
        }
        const { live } = await liveContext(ctx, ref.name);
        if (live) warnings.push('You are LIVE — viewers will see this cut immediately.');

        const decision = await ctx.confirm.gate(requested_by, {
          title: `Switch the active scene to "${ref.name}"`,
          lines: [`${items.length} item(s) in that scene.`],
          warnings,
        });
        if (!decision.approved) return fail(decision.reason);

        await ctx.commands.switchScene(ref.id);
        ctx.snapshot.invalidate();

        return ok({
          switched: true,
          scene: ref.name,
          itemCount: items.length,
          warnings,
          undo: 'Switch back with switch_scene — scene switching is not on the undo stack.',
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
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ item, visible, scene, requested_by }) =>
      guard('set_item_visibility', async () => {
        const sceneRef = await ctx.resolver.resolveScene(scene);
        const items = await sceneDetail(ctx, sceneRef);
        const target = findItem(items, item, sceneRef.name);

        if (target.visible === visible) {
          return ok({ updated: false, reason: `"${target.name}" is already ${visible ? 'visible' : 'hidden'}.` });
        }

        const { onAir } = await liveContext(ctx, sceneRef.name);
        const decision = await ctx.confirm.gate(requested_by, {
          title: `${visible ? 'Show' : 'Hide'} "${target.name}" in "${sceneRef.name}"`,
          warnings: liveWarnings(onAir, `"${target.name}"`),
        });
        if (!decision.approved) return fail(decision.reason);

        const edit = await ctx.commands.setVisibility(sceneRef, toItemRef(target), visible);
        ctx.snapshot.invalidate();

        return ok(
          withUndo({ updated: true, item: target.name, scene: sceneRef.name, visible }, edit),
        );
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
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ source, muted, volume, requested_by }) =>
      guard('set_audio', async () => {
        if (muted === undefined && volume === undefined) {
          return fail('Nothing to do: pass `muted`, `volume`, or both.');
        }
        const ref = await ctx.resolver.resolveAudioSource(source);
        const { live } = await liveContext(ctx, '');

        const changes: string[] = [];
        if (muted !== undefined) changes.push(muted ? 'mute' : 'unmute');
        if (volume !== undefined) changes.push(`set volume to ${Math.round(volume * 100)}%`);

        const decision = await ctx.confirm.gate(requested_by, {
          title: `${changes.join(' and ')} "${ref.name}"`,
          warnings: live ? ['You are LIVE — this affects your broadcast audio immediately.'] : [],
        });
        if (!decision.approved) return fail(decision.reason);

        let edit = { undo: null as string | null };
        if (muted !== undefined) {
          edit = await ctx.commands.setMuted(ref.sourceId, muted);
        }
        if (volume !== undefined) {
          edit = await ctx.commands.setDeflection(ref.sourceId, volume);
        }
        ctx.snapshot.invalidate();

        return ok(
          withUndo(
            {
              updated: true,
              source: ref.name,
              ...(muted !== undefined ? { muted } : {}),
              ...(volume !== undefined ? { volume } : {}),
            },
            edit,
          ),
        );
      }),
  );

  server.registerTool(
    'save_replay',
    {
      title: 'Save a replay clip',
      description:
        'Save the replay buffer to a clip — the "clip that" action. If the replay buffer is ' +
        'not running it is started first, in which case the clip only covers from that moment ' +
        'onward rather than the preceding minutes.',
      inputSchema: { requested_by: requestedBy },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ requested_by }) =>
      guard('save_replay', async () => {
        const snap = await ctx.snapshot.build({ maxAgeMs: 1500 });
        const wasActive = snap.stream.replayBuffer !== 'offline';

        const decision = await ctx.confirm.gate(requested_by, {
          title: 'Save a replay clip',
          warnings: wasActive
            ? []
            : ['The replay buffer is off — it will be started now, so the clip will not include the last few minutes.'],
        });
        if (!decision.approved) return fail(decision.reason);

        // Mirrors the in-app automation engine (stream-avatar/automations-engine-service.ts:96):
        // the buffer needs a moment after starting before a save produces anything.
        if (!wasActive) {
          await ctx.client.request('StreamingService', 'startReplayBuffer');
          await new Promise(r => setTimeout(r, 500));
        }
        await ctx.client.request('StreamingService', 'saveReplay');
        ctx.snapshot.invalidate();

        return ok({
          saved: true,
          bufferWasRunning: wasActive,
          note: wasActive
            ? 'Clip saved from the existing replay buffer.'
            : 'Replay buffer started and a clip saved; it covers only from now on.',
        });
      }),
  );

  server.registerTool(
    'undo_last_edit',
    {
      title: 'Undo the last edit',
      description:
        "Undo the most recent edit on Streamlabs' undo stack — the same action as Ctrl+Z in " +
        'the app. Works for edits made by you or by the streamer. Scene switching, stream ' +
        'control and replay saves are not on the undo stack and cannot be undone this way.',
      inputSchema: { requested_by: requestedBy },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ requested_by }) =>
      guard('undo_last_edit', async () => {
        const decision = await ctx.confirm.gate(requested_by, { title: 'Undo the last edit' });
        if (!decision.approved) return fail(decision.reason);

        const result = await ctx.commands.undoLast();
        ctx.snapshot.invalidate();

        if (!result.undone) return ok({ undone: false, reason: 'Nothing on the undo stack.' });
        return ok({ undone: true, action: result.undone });
      }),
  );
}

/** sceneDetail returns richer objects than Commands needs; narrow it back down. */
export function toItemRef(i: {
  resourceId: string;
  name: string;
  sceneItemId: string;
  sourceId: string;
}) {
  return {
    resourceId: i.resourceId,
    name: i.name,
    sceneItemId: i.sceneItemId,
    sourceId: i.sourceId,
  };
}
