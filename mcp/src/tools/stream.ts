/**
 * Stream and recording control.
 *
 * These use the documented external API's toggleStreaming/toggleRecording rather than
 * StreamingService.goLive(settings) -- goLive expects prepopulated platform settings and
 * multi-platform network setup, whereas the toggles are exactly what the app's own Go Live
 * button drives. Each tool checks current state first so it is explicit rather than a toggle.
 *
 * None of this is on the undo stack. Going live is the most consequential thing the agent
 * can do, so preflight problems are surfaced in the confirmation rather than after the fact.
 */

import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Ctx, fail, guard, ok, requestedBy } from './shared.js';

export function registerStream(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'go_live',
    {
      title: 'Start streaming',
      description:
        'Start the broadcast, using the platform and stream settings already configured in ' +
        'Streamlabs. Runs a preflight check first and reports any problems (nothing visible ' +
        'in the active scene, muted mic, poor encoder health) in the confirmation. Not ' +
        'undoable — use stop_stream to end the broadcast.',
      inputSchema: { requested_by: requestedBy },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ requested_by }) =>
      guard('go_live', async () => {
        const snap = await ctx.snapshot.build({ maxAgeMs: 0 });
        if (snap.stream.status === 'live') return fail('You are already live.');
        if (snap.stream.status === 'starting') return fail('A broadcast is already starting.');

        const problems = [...snap.warnings];
        const visible = snap.activeScene.items.filter(i => i.visible);
        if (visible.length === 0) {
          problems.push(`Active scene "${snap.activeScene.name}" shows nothing — viewers would see black.`);
        }
        const mic = snap.audio.find(a => /mic|aux/i.test(a.name));
        if (mic?.muted) problems.push(`"${mic.name}" is muted.`);

        const decision = await ctx.confirm.gate(requested_by, {
          title: 'Start streaming',
          lines: [
            `Scene: "${snap.activeScene.name}" with ${visible.length} visible item(s)`,
            ...(snap.stream.platforms?.length ? [`Platforms: ${snap.stream.platforms.join(', ')}`] : []),
            ...(snap.stream.title ? [`Title: ${snap.stream.title}`] : []),
          ],
          warnings: problems.length ? problems : ['Preflight checks passed.'],
        });
        if (!decision.approved) return fail(decision.reason);

        await ctx.client.request('StreamingService', 'toggleStreaming');
        ctx.snapshot.invalidate();

        return ok({
          starting: true,
          scene: snap.activeScene.name,
          preflightProblems: problems,
          note: 'Going live is asynchronous — call get_health in a few seconds to confirm.',
        });
      }),
  );

  server.registerTool(
    'stop_stream',
    {
      title: 'Stop streaming',
      description: 'End the current broadcast. Not undoable — restarting begins a new stream session.',
      inputSchema: { requested_by: requestedBy },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ requested_by }) =>
      guard('stop_stream', async () => {
        const snap = await ctx.snapshot.build({ maxAgeMs: 1500 });
        if (snap.stream.status !== 'live' && snap.stream.status !== 'reconnecting') {
          return fail(`Not currently streaming (status: ${snap.stream.status}).`);
        }

        const decision = await ctx.confirm.gate(requested_by, {
          title: 'Stop the broadcast',
          lines: snap.stream.for ? [`Live since ${snap.stream.for}.`] : [],
          warnings: ['This ends the stream for everyone watching. It cannot be undone.'],
        });
        if (!decision.approved) return fail(decision.reason);

        await ctx.client.request('StreamingService', 'toggleStreaming');
        ctx.snapshot.invalidate();

        return ok({ stopping: true, note: 'Call get_health in a few seconds to confirm.' });
      }),
  );

  server.registerTool(
    'set_recording',
    {
      title: 'Start or stop local recording',
      description:
        'Start or stop recording to a local file. Independent of streaming — you can record ' +
        'without going live, and going live does not start a recording automatically.',
      inputSchema: {
        recording: z.boolean().describe('true to start recording, false to stop.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ recording, requested_by }) =>
      guard('set_recording', async () => {
        const snap = await ctx.snapshot.build({ maxAgeMs: 1500 });
        const isRecording = snap.stream.recording === 'recording';
        if (isRecording === recording) {
          return ok({ changed: false, recording: isRecording, reason: `Already ${isRecording ? 'recording' : 'stopped'}.` });
        }

        const decision = await ctx.confirm.gate(requested_by, {
          title: recording ? 'Start local recording' : 'Stop local recording',
          warnings: recording ? [] : ['The recording file will be finalised and closed.'],
        });
        if (!decision.approved) return fail(decision.reason);

        await ctx.client.request('StreamingService', 'toggleRecording');
        ctx.snapshot.invalidate();

        return ok({ changed: true, recording, note: 'Call get_health in a few seconds to confirm.' });
      }),
  );
}
