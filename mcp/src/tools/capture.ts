/**
 * Screen capture: lets the agent SEE Streamlabs, including the OBS preview.
 *
 * Registered with the reads and ungated -- anything local can already pull the stream key off
 * the pipe, so a screenshot does not widen the machine's attack surface. It is the one payload
 * redact.ts cannot scrub, though, so the app refuses to capture the Settings window, and every
 * result names exactly which windows were shared.
 *
 * Transport: the app writes a JPEG under its data directory and returns the path; this server
 * reads the file, deletes it, and inlines it as an image block. The path never reaches the
 * agent -- Hermes agents may run sandboxed with no access to this machine's filesystem.
 */

import { readFile, unlink } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ContentBlock, Ctx, guard } from './shared.js';
import { log } from '../log.js';
import { whereToEnd } from './tour.js';

/** Mirrors ICaptureResult in app/services/capture/capture.ts. */
interface CaptureResult {
  captures: Array<{
    window: 'main' | 'child';
    component: string;
    path: string;
    width: number;
    height: number;
    bytes: number;
  }>;
  skipped: string[];
}

export function registerCapture(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'capture_screen',
    {
      title: 'Capture the Streamlabs window',
      description:
        'Take a screenshot of the Streamlabs Desktop window, including the live preview of the ' +
        'stream canvas. If a dialog is open (Source Properties, a Go Live error, ...) it is ' +
        'returned as a second image. Use this to judge how a scene LOOKS, to see what is ' +
        'selected, or to read an error dialog. Do not measure positions from it: the preview is ' +
        'scaled down and drawn with editor outlines -- use get_scene for exact geometry. Works ' +
        'while Streamlabs is covered by other windows, but not while it is minimized.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () =>
      guard('capture_screen', async () => {
        const [result, snap] = await Promise.all([
          ctx.client.request<CaptureResult>('CaptureService', 'capture', [1280]),
          ctx.snapshot.build({ maxAgeMs: 2000 }).catch(() => null),
        ]);

        const content: ContentBlock[] = [];
        const shared: string[] = [];

        for (const c of result.captures) {
          try {
            const data = await readFile(c.path);
            content.push({ type: 'image', data: data.toString('base64'), mimeType: 'image/jpeg' });
            shared.push(
              c.window === 'main'
                ? `Main window, ${c.width}x${c.height}`
                : `"${c.component}" dialog, ${c.width}x${c.height}`,
            );
            log(`capture: ${c.window} ${c.width}x${c.height} ${c.bytes} bytes`);
          } finally {
            // Never let a capture outlive the call, whether or not the read succeeded.
            await unlink(c.path).catch(() => {});
          }
        }

        const context = snap
          ? `Active scene "${snap.activeScene.name}", stream ${snap.stream.status}. ` +
            // Said before any closing switch, so the model knows whether to switch at all.
            whereToEnd(await ctx.resolver.activeScene())
          : '';

        content.push({
          type: 'text',
          text: [
            `Captured: ${shared.join('; ')}. ${context}`.trim(),
            ...result.skipped,
            'The canvas preview is scaled down and shows editor outlines; use get_scene for exact ' +
              'positions and sizes.',
          ].join('\n'),
        });

        return { content };
      }),
  );
}
