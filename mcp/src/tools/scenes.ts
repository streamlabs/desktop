/**
 * Scene management -- creating, renaming and duplicating scenes.
 *
 * Removal lives in tools/destructive.ts, not here, so that enabling scene editing at install
 * time does not also grant the ability to delete scenes.
 */

import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Ctx, fail, guard, ok, requestedBy, withUndo } from './shared.js';

export function registerScenes(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'create_scene',
    {
      title: 'Create a scene',
      description:
        'Create a new, empty scene. Does not switch to it — use switch_scene for that. To ' +
        'copy an existing scene instead, use duplicate_scene.',
      inputSchema: {
        name: z.string().describe('Name for the new scene.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ name, requested_by }) =>
      guard('create_scene', async () => {
        const existing = await ctx.resolver.sceneList();
        if (existing.some(s => s.name === name)) {
          return fail(`A scene named "${name}" already exists.`);
        }

        const decision = await ctx.confirm.gate(requested_by, {
          title: `Create a new scene named "${name}"`,
        });
        if (!decision.approved) return fail(decision.reason);

        const edit = await ctx.commands.createScene(name);
        ctx.resolver.invalidate();
        ctx.snapshot.invalidate();

        return ok(
          withUndo(
            {
              created: true,
              scene: name,
              next: 'Add sources with add_source, then lay it out with arrange_scene.',
            },
            edit,
          ),
        );
      }),
  );

  server.registerTool(
    'duplicate_scene',
    {
      title: 'Duplicate a scene',
      description:
        'Copy an existing scene, including its items and their layout, into a new scene. ' +
        'Useful for making a variant of a working scene without rebuilding it.',
      inputSchema: {
        source_scene: z.string().describe('Name of the scene to copy.'),
        name: z.string().describe('Name for the new scene.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ source_scene, name, requested_by }) =>
      guard('duplicate_scene', async () => {
        const from = await ctx.resolver.resolveScene(source_scene);
        const existing = await ctx.resolver.sceneList();
        if (existing.some(s => s.name === name)) {
          return fail(`A scene named "${name}" already exists.`);
        }

        const items = await ctx.resolver.sceneItems(from);
        const decision = await ctx.confirm.gate(requested_by, {
          title: `Duplicate "${from.name}" as "${name}"`,
          lines: [`${items.length} item(s) will be copied.`],
        });
        if (!decision.approved) return fail(decision.reason);

        const edit = await ctx.commands.createScene(name, from.id);
        ctx.resolver.invalidate();
        ctx.snapshot.invalidate();

        return ok(withUndo({ created: true, scene: name, copiedFrom: from.name, items: items.length }, edit));
      }),
  );

  server.registerTool(
    'rename_scene',
    {
      title: 'Rename a scene',
      description:
        'Change a scene\'s name. Anything referring to it by the old name — Stream Deck ' +
        'buttons, hotkeys, other tooling — will need updating.',
      inputSchema: {
        scene: z.string().describe('Current scene name.'),
        name: z.string().describe('New name.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ scene, name, requested_by }) =>
      guard('rename_scene', async () => {
        const ref = await ctx.resolver.resolveScene(scene);
        const existing = await ctx.resolver.sceneList();
        if (existing.some(s => s.name === name)) {
          return fail(`A scene named "${name}" already exists.`);
        }

        const decision = await ctx.confirm.gate(requested_by, {
          title: `Rename the scene "${ref.name}" to "${name}"`,
          warnings: ['Anything referencing the old scene name will need updating.'],
        });
        if (!decision.approved) return fail(decision.reason);

        const edit = await ctx.commands.renameScene(ref.id, name);
        ctx.resolver.invalidate();
        ctx.snapshot.invalidate();

        return ok(withUndo({ renamed: true, from: ref.name, to: name }, edit));
      }),
  );
}
