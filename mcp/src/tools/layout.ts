/**
 * Layout and geometry.
 *
 * set_item_transform takes semantic anchors and a width percentage so the model never has to
 * invent pixel coordinates for a canvas it cannot see, and every result reports the resulting
 * rectangle plus geometry checks so the change can be verified rather than assumed.
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
import { toItemRef } from './performance.js';
import {
  ANCHORS,
  Anchor,
  Canvas,
  Rect,
  anchorRect,
  describeRect,
  inspectPlacement,
  rect,
} from '../layout/geometry.js';

export function registerLayout(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'set_item_transform',
    {
      title: 'Move, resize or rotate a scene item',
      description:
        'Reposition, resize or rotate one item. Prefer the semantic options over raw pixels: ' +
        '`anchor` places the item in a named region inset from the canvas edge by the ' +
        'title-safe margin, and `width_percent` sizes it as a share of canvas width with ' +
        'aspect ratio preserved. `action` applies a one-shot operation instead. Returns the ' +
        'resulting rectangle plus geometry checks, since you cannot see the output.',
      inputSchema: {
        item: z.string().describe('Name of the scene item, e.g. "Webcam".'),
        scene: z.string().optional().describe('Scene name. Defaults to the active scene.'),
        anchor: z
          .enum(ANCHORS as [Anchor, ...Anchor[]])
          .optional()
          .describe('Named position, inset from the canvas edges by the title-safe margin.'),
        position: z
          .object({ x: z.number(), y: z.number() })
          .optional()
          .describe('Absolute top-left position in canvas pixels. Ignored if `anchor` is given.'),
        width_percent: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe('Width as a percentage of canvas width; height follows the aspect ratio.'),
        scale: z
          .object({ x: z.number(), y: z.number() })
          .optional()
          .describe('Absolute scale multiplier. Ignored if `width_percent` is given.'),
        rotation: z.number().optional().describe('Rotation in degrees.'),
        action: z
          .enum(['fit', 'stretch', 'center', 'reset'])
          .optional()
          .describe(
            'One-shot operation, applied instead of the other options: fit to screen ' +
              '(preserving aspect), stretch to fill, centre on screen, or reset the transform.',
          ),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ item, scene, anchor, position, width_percent, scale, rotation, action, requested_by }) =>
      guard('set_item_transform', async () => {
        const sceneRef = await ctx.resolver.resolveScene(scene);
        const [items, snap] = await Promise.all([
          sceneDetail(ctx, sceneRef),
          ctx.snapshot.build({ maxAgeMs: 5000 }),
        ]);
        const target = findItem(items, item, sceneRef.name);
        const canvas: Canvas = snap.canvas;
        const ref = toItemRef(target);

        if (target.locked) {
          return fail(`"${target.name}" is locked in "${sceneRef.name}". Unlock it in Streamlabs first.`);
        }

        const { onAir } = await liveContext(ctx, sceneRef.name);
        const others = items
          .filter(i => i.visible && i.name !== target.name)
          .map(i => ({ name: i.name, rect: i.rect }));

        // ---- one-shot actions
        if (action) {
          const decision = await ctx.confirm.gate(requested_by, {
            title: `${action} "${target.name}" in "${sceneRef.name}"`,
            lines: [`Currently ${describeRect(target.rect, canvas)}.`],
            warnings: liveWarnings(onAir, `"${target.name}"`),
          });
          if (!decision.approved) return fail(decision.reason);

          const edit =
            action === 'fit'
              ? await ctx.commands.fitToScreen(sceneRef, ref)
              : action === 'stretch'
                ? await ctx.commands.stretchToScreen(sceneRef, ref)
                : action === 'center'
                  ? await ctx.commands.centerOnScreen(sceneRef, ref)
                  : await ctx.commands.resetTransform(sceneRef, ref);

          ctx.snapshot.invalidate();
          return ok(withUndo(await describeOutcome(ctx, sceneRef, target.name, canvas, others), edit));
        }

        // ---- compute the target box
        if (
          anchor === undefined &&
          position === undefined &&
          width_percent === undefined &&
          scale === undefined &&
          rotation === undefined
        ) {
          return fail('Nothing to do: pass `anchor`, `position`, `width_percent`, `scale`, `rotation` or `action`.');
        }

        let targetScale = target.transform.scale;
        if (width_percent !== undefined) {
          const w = (canvas[0] * width_percent) / 100;
          const aspect =
            target.sourceWidth > 0 && target.sourceHeight > 0
              ? target.sourceWidth / target.sourceHeight
              : target.rect.width / Math.max(1, target.rect.height);
          const h = w / (aspect || 16 / 9);
          targetScale = {
            x: target.sourceWidth > 0 ? w / target.sourceWidth : target.transform.scale.x,
            y: target.sourceHeight > 0 ? h / target.sourceHeight : target.transform.scale.y,
          };
        } else if (scale) {
          targetScale = scale;
        }

        const newSize = {
          width: target.sourceWidth * targetScale.x,
          height: target.sourceHeight * targetScale.y,
        };

        let targetPos = target.transform.position;
        if (anchor) {
          const r = anchorRect(anchor, newSize, canvas);
          targetPos = { x: r.x, y: r.y };
        } else if (position) {
          targetPos = position;
        }

        const projected: Rect = rect(targetPos.x, targetPos.y, newSize.width, newSize.height);
        const checks = inspectPlacement(target.name, projected, canvas, others);

        const decision = await ctx.confirm.gate(requested_by, {
          title: `Move "${target.name}" in "${sceneRef.name}"`,
          lines: [
            `from  ${describeRect(target.rect, canvas)}`,
            `to    ${describeRect(projected, canvas)}`,
            ...checks.map(c => `${c.ok ? '+' : '!'} ${c.text}`),
          ],
          warnings: liveWarnings(onAir, `"${target.name}"`),
        });
        if (!decision.approved) return fail(decision.reason);

        const edit = await ctx.commands.setItemTransform(
          sceneRef,
          ref,
          { position: targetPos, scale: targetScale, ...(rotation !== undefined ? { rotation } : {}) },
          { position: target.transform.position, scale: target.transform.scale },
        );
        ctx.snapshot.invalidate();

        return ok(withUndo(await describeOutcome(ctx, sceneRef, target.name, canvas, others), edit));
      }),
  );

  server.registerTool(
    'reorder_item',
    {
      title: 'Change scene item stacking order',
      description:
        'Move an item within the scene list, which controls what draws on top of what. Give ' +
        '`relative_to` and `placement` for an unambiguous move. get_scene returns items in ' +
        'scene-list order, and the tool reports the resulting index so you can verify the ' +
        'outcome rather than assuming a convention.',
      inputSchema: {
        item: z.string().describe('Name of the item to move.'),
        relative_to: z.string().describe('Name of the item to move it next to.'),
        placement: z
          .enum(['before', 'after'])
          .describe('Place the item before or after `relative_to` in the scene list.'),
        scene: z.string().optional().describe('Scene name. Defaults to the active scene.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ item, relative_to, placement, scene, requested_by }) =>
      guard('reorder_item', async () => {
        const sceneRef = await ctx.resolver.resolveScene(scene);
        const items = await sceneDetail(ctx, sceneRef);
        const target = findItem(items, item, sceneRef.name);
        const dest = findItem(items, relative_to, sceneRef.name);
        if (target.sceneItemId === dest.sceneItemId) {
          return fail('`item` and `relative_to` are the same item.');
        }

        const { onAir } = await liveContext(ctx, sceneRef.name);
        const decision = await ctx.confirm.gate(requested_by, {
          title: `Move "${target.name}" ${placement} "${dest.name}" in "${sceneRef.name}"`,
          lines: [`Current order: ${JSON.stringify(items.map(i => i.name))}`],
          warnings: liveWarnings(onAir, `"${target.name}"`),
        });
        if (!decision.approved) return fail(decision.reason);

        const edit = await ctx.commands.reorder(sceneRef, toItemRef(target), dest.sceneItemId, placement);
        ctx.snapshot.invalidate();

        const after = await sceneDetail(ctx, sceneRef);
        return ok(
          withUndo(
            {
              reordered: true,
              item: target.name,
              scene: sceneRef.name,
              newIndex: after.findIndex(i => i.sceneItemId === target.sceneItemId),
              order: after.map(i => i.name),
            },
            edit,
          ),
        );
      }),
  );

  server.registerTool(
    'group_items',
    {
      title: 'Group scene items into a folder',
      description:
        'Put several items into a named folder in the scene list, so they can be shown, ' +
        'hidden and moved together.',
      inputSchema: {
        items: z.array(z.string()).min(1).describe('Names of the items to group.'),
        name: z.string().describe('Name for the new folder.'),
        scene: z.string().optional().describe('Scene name. Defaults to the active scene.'),
        requested_by: requestedBy,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ items, name, scene, requested_by }) =>
      guard('group_items', async () => {
        const sceneRef = await ctx.resolver.resolveScene(scene);
        const detail = await sceneDetail(ctx, sceneRef);
        const targets = items.map(n => findItem(detail, n, sceneRef.name));

        const { onAir } = await liveContext(ctx, sceneRef.name);
        const decision = await ctx.confirm.gate(requested_by, {
          title: `Group ${targets.length} item(s) into a folder named "${name}"`,
          lines: [JSON.stringify(targets.map(t => t.name))],
          warnings: liveWarnings(onAir, 'these items'),
        });
        if (!decision.approved) return fail(decision.reason);

        const edit = await ctx.commands.groupItems(
          sceneRef,
          name,
          targets.map(t => t.sceneItemId),
        );
        ctx.snapshot.invalidate();

        return ok(
          withUndo({ grouped: true, folder: name, items: targets.map(t => t.name), scene: sceneRef.name }, edit),
        );
      }),
  );
}

async function describeOutcome(
  ctx: Ctx,
  sceneRef: { name: string; id: string; resourceId: string },
  itemName: string,
  canvas: Canvas,
  others: Array<{ name: string; rect: Rect }>,
) {
  const after = await sceneDetail(ctx, sceneRef);
  const now = after.find(i => i.name === itemName);
  if (!now) return { updated: true, item: itemName, scene: sceneRef.name };

  const checks = inspectPlacement(now.name, now.rect, canvas, others);
  return {
    updated: true,
    item: now.name,
    scene: sceneRef.name,
    rect: [now.rect.x, now.rect.y, now.rect.width, now.rect.height],
    where: describeRect(now.rect, canvas),
    checks: checks.map(c => `${c.ok ? '+' : '!'} ${c.text}`),
  };
}
