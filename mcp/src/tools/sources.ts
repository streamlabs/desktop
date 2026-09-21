/**
 * Source creation, settings and filters.
 *
 * get_source_settings is read-only but lives in this group deliberately: anyone who enables
 * source editing needs to read settings before writing them, and splitting the pair across
 * install-time permission groups would make the write half unusable on its own.
 *
 * Settings go through EditSourceSettingsCommand (raw values) rather than
 * EditSourcePropertiesCommand (TObsFormData). Form data is far larger and would breach the
 * 4 KB request cap in client.ts for browser and capture sources.
 */

import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  Ctx,
  fail,
  guard,
  liveContext,
  liveWarnings,
  ok,
  requestedBy,
  sceneDetail,
  withUndo,
} from './shared.js';
import { describeRect } from '../layout/geometry.js';

/** Rough byte budget for a settings dict, well under the 4 KB frame cap. */
const MAX_SETTINGS_BYTES = 2048;

/**
 * Registered even in read-only mode: reading settings is a prerequisite for writing them,
 * and it is useful on its own for troubleshooting a misconfigured source.
 */
export function registerSourceReads(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'get_source_settings',
    {
      title: "Get a source's settings",
      description:
        'Read the current settings of a source by name, plus its filters. Use this before ' +
        'set_source_settings so you send a complete, valid value rather than guessing keys. ' +
        'Secrets such as tokens embedded in widget URLs are redacted.',
      inputSchema: { source: z.string().describe('Source name.') },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ source }) =>
      guard('get_source_settings', async () => {
        const sources = await ctx.resolver.sources();
        const match = pickSource(sources, source);

        const [settings, filters] = await Promise.all([
          ctx.client.request<Record<string, unknown>>(`Source["${match.sourceId}"]`, 'getSettings'),
          ctx.client
            .request<unknown[]>('SourceFiltersService', 'filtersBySourceId', [match.sourceId])
            .catch(() => [] as unknown[]),
        ]);

        return ok({
          source: match.name,
          type: match.type,
          width: match.width,
          height: match.height,
          settings,
          filters: (filters ?? []).map((f: any) => ({
            name: f?.name,
            type: f?.type,
            visible: f?.visible,
          })),
        });
      }),
  );
}

export function registerSources(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'add_source',
    {
      title: 'Add a source to a scene',
      description:
        'Create a new source and add it to a scene. Call list_source_types first for valid ' +
        'type identifiers. Common ones: browser_source (settings: url, width, height), ' +
        'text_gdiplus (text), image_source (file), ffmpeg_source (local_file), color_source, ' +
        'game_capture, monitor_capture, window_capture, dshow_input (a camera). The new item ' +
        'lands at its default size and position — follow up with arrange_scene or ' +
        'set_item_transform to place it.',
      inputSchema: {
        name: z.string().describe('Name for the new source, as it will appear in the sources list.'),
        type: z.string().describe('Source type identifier from list_source_types, e.g. "browser_source".'),
        settings: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Type-specific settings, e.g. { "url": "https://...", "width": 800 }.'),
        scene: z.string().optional().describe('Scene name. Defaults to the active scene.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ name, type, settings, scene, requested_by }) =>
      guard('add_source', async () => {
        const sceneRef = await ctx.resolver.resolveScene(scene);

        if (settings && JSON.stringify(settings).length > MAX_SETTINGS_BYTES) {
          return fail(
            `Settings are too large (${JSON.stringify(settings).length} bytes). The API frame ` +
              `limit is 4 KB — create the source with minimal settings, then apply the rest ` +
              `with set_source_settings in smaller batches.`,
          );
        }

        const existing = await ctx.resolver.sources();
        if (existing.some(s => s.name === name)) {
          return fail(`A source named "${name}" already exists. Pick a different name.`);
        }

        const { onAir } = await liveContext(ctx, sceneRef.name);
        const decision = await ctx.confirm.gate(requested_by, {
          title: `Add a ${type} named "${name}" to "${sceneRef.name}"`,
          lines: settings ? [`Settings: ${JSON.stringify(settings)}`] : [],
          warnings: liveWarnings(onAir, 'this scene'),
        });
        if (!decision.approved) return fail(decision.reason);

        const edit = await ctx.commands.addSource(sceneRef, name, type, settings);
        ctx.resolver.invalidate();
        ctx.snapshot.invalidate();

        const after = await sceneDetail(ctx, sceneRef);
        const created = after.find(i => i.name === name);
        const snap = await ctx.snapshot.build({ maxAgeMs: 0 });

        return ok(
          withUndo(
            {
              added: true,
              name,
              type,
              scene: sceneRef.name,
              ...(created
                ? {
                    rect: [created.rect.x, created.rect.y, created.rect.width, created.rect.height],
                    where: describeRect(created.rect, snap.canvas),
                  }
                : {}),
              next: 'Use arrange_scene or set_item_transform to position it.',
            },
            edit,
          ),
        );
      }),
  );

  server.registerTool(
    'set_source_settings',
    {
      title: 'Change a source\'s settings',
      description:
        'Update settings on an existing source by name — a browser source URL, text content, ' +
        'a media file path, a capture target. Only the keys you pass are changed. Read the ' +
        'current values with get_source_settings first.',
      inputSchema: {
        source: z.string().describe('Source name.'),
        settings: z
          .record(z.string(), z.unknown())
          .describe('Settings to merge, e.g. { "url": "https://example.com" }.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ source, settings, requested_by }) =>
      guard('set_source_settings', async () => {
        if (JSON.stringify(settings).length > MAX_SETTINGS_BYTES) {
          return fail(
            `Settings are too large (${JSON.stringify(settings).length} bytes) for the 4 KB ` +
              `API frame limit. Apply them in smaller batches.`,
          );
        }
        const sources = await ctx.resolver.sources();
        const match = pickSource(sources, source);
        const { live } = await liveContext(ctx, '');

        const decision = await ctx.confirm.gate(requested_by, {
          title: `Change settings on "${match.name}" (${match.type})`,
          lines: [JSON.stringify(settings)],
          warnings: live ? ['You are LIVE — if this source is on screen, viewers see the change.'] : [],
        });
        if (!decision.approved) return fail(decision.reason);

        const edit = await ctx.commands.setSourceSettings(match.sourceId, settings);
        ctx.snapshot.invalidate();

        return ok(withUndo({ updated: true, source: match.name, applied: settings }, edit));
      }),
  );

  server.registerTool(
    'add_filter',
    {
      title: 'Add a filter to a source',
      description:
        'Add an effect filter to a source. Common types: chroma_key (green screen), ' +
        'color_filter (brightness/contrast/saturation), noise_suppress_filter, ' +
        'noise_gate_filter, compressor_filter, crop_filter, scale_filter. Omit settings to ' +
        'use the filter\'s defaults.',
      inputSchema: {
        source: z.string().describe('Source name.'),
        filter_type: z.string().describe('Filter type identifier, e.g. "chroma_key".'),
        name: z.string().optional().describe('Name for the filter. Defaults to the type name.'),
        settings: z.record(z.string(), z.unknown()).optional().describe('Filter-specific settings.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ source, filter_type, name, settings, requested_by }) =>
      guard('add_filter', async () => {
        const sources = await ctx.resolver.sources();
        const match = pickSource(sources, source);
        const filterName = name ?? filter_type;
        const { live } = await liveContext(ctx, '');

        const decision = await ctx.confirm.gate(requested_by, {
          title: `Add a ${filter_type} filter named "${filterName}" to "${match.name}"`,
          lines: settings ? [JSON.stringify(settings)] : [],
          warnings: live ? ['You are LIVE — if this source is on screen, viewers see the change.'] : [],
        });
        if (!decision.approved) return fail(decision.reason);

        const edit = await ctx.commands.addFilter(match.sourceId, filter_type, filterName, settings);
        ctx.snapshot.invalidate();

        return ok(withUndo({ added: true, filter: filterName, type: filter_type, source: match.name }, edit));
      }),
  );

  server.registerTool(
    'remove_filter',
    {
      title: 'Remove a filter from a source',
      description: 'Remove a named filter from a source. Read current filters with get_source_settings.',
      inputSchema: {
        source: z.string().describe('Source name.'),
        filter: z.string().describe('Filter name, as returned by get_source_settings.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ source, filter, requested_by }) =>
      guard('remove_filter', async () => {
        const sources = await ctx.resolver.sources();
        const match = pickSource(sources, source);

        const decision = await ctx.confirm.gate(requested_by, {
          title: `Remove the filter "${filter}" from "${match.name}"`,
        });
        if (!decision.approved) return fail(decision.reason);

        const edit = await ctx.commands.removeFilter(match.sourceId, filter);
        ctx.snapshot.invalidate();

        return ok(withUndo({ removed: true, filter, source: match.name }, edit));
      }),
  );
}

/** Same match ladder as the Resolver, applied to the source list. */
export function pickSource<T extends { name: string }>(sources: T[], needle: string): T {
  const want = needle.trim();
  const exact = sources.filter(s => s.name === want);
  if (exact.length === 1) return exact[0];

  const ci = sources.filter(s => s.name.toLowerCase() === want.toLowerCase());
  if (ci.length === 1) return ci[0];

  const sub = sources.filter(s => s.name.toLowerCase().includes(want.toLowerCase()));
  if (sub.length === 1) return sub[0];

  if (sub.length > 1) {
    throw new Error(
      `Ambiguous source "${needle}" — matches ${JSON.stringify(sub.map(s => s.name))}. Use the exact name.`,
    );
  }
  throw new Error(
    `No source named "${needle}". Available: ${JSON.stringify(sources.map(s => s.name))}.`,
  );
}
