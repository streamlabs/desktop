/**
 * Destructive operations, kept in their own group so that enabling scene or source editing
 * at install time never implies the ability to delete things.
 *
 * Each tool computes and reports its BLAST RADIUS before acting -- which scenes a source
 * appears in, how many items a scene holds, what filters go with it. That information is
 * the whole reason a server-side confirmation beats a generic client prompt: the client can
 * show arguments, but only we can say "this source is in three scenes and one is live".
 *
 * A caveat worth carrying: source removal is undoable, but the app restores it by replaying
 * a scene-collection snapshot (remove-item.ts:12-14, whose author wrote "Hacky? Yes.
 * Problems? Probably."). Treat it as recoverable-in-principle rather than guaranteed.
 */

import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  Ctx,
  fail,
  findItem,
  guard,
  liveContext,
  ok,
  requestedBy,
  sceneDetail,
  withUndo,
} from './shared.js';
import { toItemRef } from './performance.js';
import { pickSource } from './sources.js';

/** Guard against pathological collections when computing blast radius. */
const MAX_SCENES_SCANNED = 40;

export function registerDestructive(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'remove_item',
    {
      title: 'Remove an item from a scene',
      description:
        'Remove one item from a scene. The underlying source survives and stays available to ' +
        'other scenes — use remove_source to delete the source itself.',
      inputSchema: {
        item: z.string().describe('Name of the scene item to remove.'),
        scene: z.string().optional().describe('Scene name. Defaults to the active scene.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ item, scene, requested_by }) =>
      guard('remove_item', async () => {
        const sceneRef = await ctx.resolver.resolveScene(scene);
        const items = await sceneDetail(ctx, sceneRef);
        const target = findItem(items, item, sceneRef.name);
        const { onAir } = await liveContext(ctx, sceneRef.name);

        const alsoIn = await scenesUsingSource(ctx, target.sourceId, sceneRef.name);
        const warnings: string[] = [];
        if (onAir) warnings.push(`You are LIVE and "${sceneRef.name}" is the active scene — this disappears from the broadcast immediately.`);
        if (alsoIn.length) warnings.push(`The source stays in: ${alsoIn.join(', ')}.`);

        const decision = await ctx.confirm.gate(requested_by, {
          title: `Remove "${target.name}" from "${sceneRef.name}"`,
          lines: [
            `Type: ${target.type}`,
            `Currently ${target.visible ? 'visible' : 'hidden'}.`,
            'The source itself is not deleted.',
          ],
          warnings,
        });
        if (!decision.approved) return fail(decision.reason);

        const edit = await ctx.commands.removeItem(sceneRef, toItemRef(target));
        ctx.snapshot.invalidate();

        return ok(
          withUndo({ removed: true, item: target.name, scene: sceneRef.name, sourceKept: true }, edit),
        );
      }),
  );

  server.registerTool(
    'remove_source',
    {
      title: 'Delete a source entirely',
      description:
        'Delete a source from every scene it appears in, along with its settings and filters. ' +
        'This is not the same as remove_item, which only takes it out of one scene. Reports ' +
        'which scenes are affected before acting.',
      inputSchema: {
        source: z.string().describe('Source name.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ source, requested_by }) =>
      guard('remove_source', async () => {
        const sources = await ctx.resolver.sources();
        const match = pickSource(sources, source);

        const usedIn = await scenesUsingSource(ctx, match.sourceId);
        const filters = await ctx.client
          .request<unknown[]>('SourceFiltersService', 'filtersBySourceId', [match.sourceId])
          .catch(() => [] as unknown[]);

        const snap = await ctx.snapshot.build({ maxAgeMs: 2000 });
        const live = snap.stream.status === 'live';
        const hitsActive = usedIn.includes(snap.activeScene.name);

        const warnings: string[] = [];
        if (live && hitsActive) {
          warnings.push(`You are LIVE and this source is in the active scene "${snap.activeScene.name}".`);
        }
        warnings.push(
          'Undo restores deleted sources by replaying a scene-collection snapshot; it usually works, but treat it as best-effort rather than guaranteed.',
        );

        const decision = await ctx.confirm.gate(requested_by, {
          title: `Delete the source "${match.name}" (${match.type})`,
          lines: [
            usedIn.length
              ? `Used in ${usedIn.length} scene(s): ${usedIn.join(', ')}`
              : 'Not currently used in any scene.',
            ...((filters ?? []).length
              ? [`${filters.length} filter(s) will go with it: ${(filters as any[]).map(f => f?.name).join(', ')}`]
              : []),
          ],
          warnings,
        });
        if (!decision.approved) return fail(decision.reason);

        const edit = await ctx.commands.removeSource(match.sourceId);
        ctx.resolver.invalidate();
        ctx.snapshot.invalidate();

        return ok(
          withUndo({ removed: true, source: match.name, type: match.type, affectedScenes: usedIn }, edit),
        );
      }),
  );

  server.registerTool(
    'remove_scene',
    {
      title: 'Delete a scene',
      description:
        'Delete an entire scene and everything in it. Sources used elsewhere survive. Refuses ' +
        'to delete the last remaining scene, and reports what the scene contains first.',
      inputSchema: {
        scene: z.string().describe('Name of the scene to delete.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ scene, requested_by }) =>
      guard('remove_scene', async () => {
        const ref = await ctx.resolver.resolveScene(scene);
        const all = await ctx.resolver.sceneList();
        if (all.length <= 1) {
          return fail('This is the only scene — Streamlabs needs at least one. Create another first.');
        }

        const items = await sceneDetail(ctx, ref);
        const snap = await ctx.snapshot.build({ maxAgeMs: 2000 });
        const isActive = snap.activeScene.name === ref.name;
        const live = snap.stream.status === 'live';

        const warnings: string[] = [];
        if (live && isActive) {
          warnings.push('You are LIVE and this is the ACTIVE scene — Streamlabs will cut to another scene.');
        } else if (isActive) {
          warnings.push('This is the active scene; Streamlabs will switch to another one.');
        }

        const decision = await ctx.confirm.gate(requested_by, {
          title: `Delete the scene "${ref.name}"`,
          lines: [
            items.length
              ? `Contains ${items.length} item(s): ${items.map(i => i.name).join(', ')}`
              : 'The scene is empty.',
            'Sources used in other scenes are not deleted.',
          ],
          warnings,
        });
        if (!decision.approved) return fail(decision.reason);

        const edit = await ctx.commands.removeScene(ref.id);
        ctx.resolver.invalidate();
        ctx.snapshot.invalidate();

        return ok(
          withUndo({ removed: true, scene: ref.name, itemsRemoved: items.length }, edit),
        );
      }),
  );
}

/**
 * Which scenes contain a given source. One Scene.getModel() per scene -- acceptable for a
 * destructive confirmation, but not something to call on a hot path.
 */
async function scenesUsingSource(ctx: Ctx, sourceId: string, exclude?: string): Promise<string[]> {
  if (!sourceId) return [];
  const scenes = (await ctx.resolver.sceneList()).slice(0, MAX_SCENES_SCANNED);

  const results = await Promise.all(
    scenes.map(async s => {
      if (s.name === exclude) return null;
      try {
        const items = await sceneDetail(ctx, s);
        return items.some(i => i.sourceId === sourceId) ? s.name : null;
      } catch {
        return null;
      }
    }),
  );

  return results.filter((n): n is string => n !== null);
}
