/**
 * Layout and geometry.
 *
 * set_item_transform takes semantic anchors and a width percentage so the model never has to
 * invent pixel coordinates by hand, and every result reports the resulting
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
import { afterWebcamChange } from './studio.js';
import { FRAME_STRIP_RE } from '../present.js';
import {
  ANCHORS,
  Anchor,
  Canvas,
  Rect,
  anchorRect,
  describeRect,
  inspectPlacement,
  isFullBleed,
  isFullyOffCanvas,
  isPartlyOffCanvas,
  rect,
  TITLE_SAFE_MARGIN,
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
        'resulting rectangle plus geometry checks, so the change can be verified exactly.',
      inputSchema: {
        item: z.string().describe('Name of the scene item, e.g. "Webcam".'),
        scene: z.string().optional().describe('Scene name. Defaults to the active scene.'),
        anchor: z
          .enum(ANCHORS as [Anchor, ...Anchor[]])
          .optional()
          .describe(
            'Named position, inset from the canvas edges by the title-safe margin (48px). Add ' +
              'flush: true to put it right against the edge instead.',
          ),
        flush: z
          .boolean()
          .optional()
          .describe(
            'With anchor: no margin, so the item sits right against the screen edge/corner. ' +
              'Use this for "flush", "no gap", "in the very corner".',
          ),
        position: z
          .object({ x: z.number(), y: z.number() })
          .optional()
          .describe('Absolute top-left position in canvas pixels. Ignored if `anchor` is given.'),
        width_percent: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe(
            'Width as a percentage of canvas width; height follows the aspect ratio. Full ' +
              'screen: 100 with "anchor": "center" and "flush": true.',
          ),
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
    async ({
      item,
      scene,
      anchor,
      flush,
      position,
      width_percent,
      scale,
      rotation,
      action,
      requested_by,
    }) =>
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
          return fail(
            `"${target.name}" is locked in "${sceneRef.name}". Unlock it in Streamlabs first.`,
          );
        }

        const { onAir } = await liveContext(ctx, sceneRef.name);
        const isCam = target.type === 'dshow_input';
        // The webcam's own frame strips and hidden camera copies are not "other items".
        const others = items
          .filter(
            i =>
              i.visible &&
              i.name !== target.name &&
              !FRAME_STRIP_RE.test(i.name) &&
              !(isCam && i.type === 'dshow_input'),
          )
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

          if (isCam) await afterWebcamChange(ctx, sceneRef);
          ctx.snapshot.invalidate();
          return ok(
            withUndo(await describeOutcome(ctx, sceneRef, target.name, canvas, others), edit),
          );
        }

        // ---- compute the target box
        if (
          anchor === undefined &&
          position === undefined &&
          width_percent === undefined &&
          scale === undefined &&
          rotation === undefined
        ) {
          return fail(
            'Nothing to do: pass `anchor`, `position`, `width_percent`, `scale`, `rotation` or `action`.',
          );
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
        let clamped = false;
        if (anchor) {
          const r = anchorRect(anchor, newSize, canvas, flush ? 0 : undefined);
          targetPos = { x: r.x, y: r.y };
        } else if (position) {
          // Keep it on screen: an explicit position past the edge is almost always a misjudged
          // nudge toward the edge, not a request to clip the item.
          const x =
            newSize.width <= canvas[0]
              ? Math.min(Math.max(position.x, 0), canvas[0] - newSize.width)
              : position.x;
          const y =
            newSize.height <= canvas[1]
              ? Math.min(Math.max(position.y, 0), canvas[1] - newSize.height)
              : position.y;
          clamped =
            Math.round(x) !== Math.round(position.x) || Math.round(y) !== Math.round(position.y);
          targetPos = { x: Math.round(x), y: Math.round(y) };
        } else if (target.rect.width > 0 && target.rect.height > 0) {
          // Resize in place: keep the edges the item hugs. A bottom-right webcam grows up and
          // to the left instead of off the canvas; a centered one grows about its center.
          targetPos = resizeInPlace(target.rect, newSize, canvas);
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
          {
            position: targetPos,
            scale: targetScale,
            ...(rotation !== undefined ? { rotation } : {}),
          },
          { position: target.transform.position, scale: target.transform.scale },
        );
        if (isCam) await afterWebcamChange(ctx, sceneRef);
        ctx.snapshot.invalidate();

        const outcome = await describeOutcome(ctx, sceneRef, target.name, canvas, others);
        return ok(
          withUndo(
            clamped
              ? {
                  ...outcome,
                  note:
                    'That position would have pushed it off the screen, so it was kept at the ' +
                    'edge. For flush against an edge, use anchor with flush: true.',
                }
              : outcome,
            edit,
          ),
        );
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

        const edit = await ctx.commands.reorder(
          sceneRef,
          toItemRef(target),
          dest.sceneItemId,
          placement,
        );
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
          withUndo(
            { grouped: true, folder: name, items: targets.map(t => t.name), scene: sceneRef.name },
            edit,
          ),
        );
      }),
  );
}

/**
 * New top-left for a resize that keeps the item where it visually is: anchored to whichever
 * horizontal/vertical edge (or center) it is nearest, then clamped inside the title-safe area
 * when it fits there.
 */
function resizeInPlace(
  current: Rect,
  size: { width: number; height: number },
  canvas: Canvas,
): { x: number; y: number } {
  const [cw, ch] = canvas;
  const M = TITLE_SAFE_MARGIN;
  const cx = current.x + current.width / 2;
  const cy = current.y + current.height / 2;

  let x: number;
  if (cx < cw / 3) x = current.x;
  else if (cx > (cw * 2) / 3) x = current.x + current.width - size.width;
  else x = cx - size.width / 2;

  let y: number;
  if (cy < ch / 3) y = current.y;
  else if (cy > (ch * 2) / 3) y = current.y + current.height - size.height;
  else y = cy - size.height / 2;

  // Respect the margin the item already had: inside the safe area stays inside it, flush
  // against an edge stays flush.
  const mx = current.x < M - 1 || current.x + current.width > cw - M + 1 ? 0 : M;
  const my = current.y < M - 1 || current.y + current.height > ch - M + 1 ? 0 : M;
  if (size.width <= cw - 2 * mx) x = Math.min(Math.max(x, mx), cw - mx - size.width);
  if (size.height <= ch - 2 * my) y = Math.min(Math.max(y, my), ch - my - size.height);
  return { x: Math.round(x), y: Math.round(y) };
}

async function describeOutcome(
  ctx: Ctx,
  sceneRef: { name: string; id: string; resourceId: string },
  itemName: string,
  canvas: Canvas,
  others: Array<{ name: string; rect: Rect }>,
) {
  void others; // recomputed below: the change may have moved other items (text dodging the webcam)
  ctx.resolver.invalidate();
  const after = (await sceneDetail(ctx, sceneRef)).filter(i => i.display === 'horizontal');
  const now = after.find(i => i.name === itemName);
  if (!now) return { updated: true, item: itemName, scene: sceneRef.name };

  const isCam = now.type === 'dshow_input';
  const fresh = after
    .filter(
      i =>
        i.visible &&
        i.sceneItemId !== now.sceneItemId &&
        !FRAME_STRIP_RE.test(i.name) &&
        !(isCam && i.type === 'dshow_input') &&
        // a full-screen color block is the background: it is behind, not "covered"
        !(i.type === 'color_source' && isFullBleed(i.rect, canvas)),
    )
    .map(i => ({ name: i.name, rect: i.rect }));
  let checks = inspectPlacement(now.name, now.rect, canvas, fresh);

  // Sitting right against an edge on purpose (flush) is not a title-safe problem.
  const [cw, ch] = canvas;
  const r = now.rect;
  const flushEdges = [
    r.x <= 0 && 'left',
    r.y <= 0 && 'top',
    Math.abs(r.x + r.width - cw) <= 1 && 'right',
    Math.abs(r.y + r.height - ch) <= 1 && 'bottom',
  ].filter(Boolean);
  if (flushEdges.length && !isFullyOffCanvas(r, canvas) && !isPartlyOffCanvas(r, canvas)) {
    checks = [
      ...checks.filter(c => !/title-safe/.test(c.text)),
      {
        ok: true,
        text: `flush against the ${flushEdges.join(' and ')} edge${
          flushEdges.length > 1 ? 's' : ''
        }`,
      } as typeof checks[number],
    ];
  }
  return {
    updated: true,
    item: now.name,
    scene: sceneRef.name,
    rect: [now.rect.x, now.rect.y, now.rect.width, now.rect.height],
    where: describeRect(now.rect, canvas),
    checks: checks.map(c => `${c.ok ? '+' : '!'} ${c.text}`),
  };
}
