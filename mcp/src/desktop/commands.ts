/**
 * The single chokepoint for every write.
 *
 * Everything routes through EditorCommandsService.executeCommand, exactly as the app's own
 * UI drives edits, so changes land on the undo stack and Ctrl+Z reverts them.
 *
 * This REQUIRES the app-side alias in external-api/resources.ts:
 *
 *   export { Selection as InternalSelection } from 'services/selection';
 *
 * Commands whose constructor takes only primitives work without it, but every transform,
 * reorder, group and node-removal command takes a Selection -- and `Selection[...]` resolves
 * to the *external* helper, which has no `state` (modify-transform.ts:20 throws on it) and
 * whose `freeze()` writes to a fallback proxy instead of the real object. Without the alias
 * those tools fail with "resource not found" from the app.
 *
 * SIZE LIMIT: client.ts caps a request at 4 KB, because the app's socket handler does no
 * inbound reassembly. Anything carrying TObsFormData will blow through that -- prefer
 * EditSourceSettingsCommand with a minimal settings dict over EditSourceProperties.
 */

import { DesktopClient } from './client.js';
import { ItemRef, SceneRef } from './resolver.js';
import { log } from '../log.js';

export interface EditResult {
  applied: true;
  /** Description of the undo entry, as the app will label it for Ctrl+Z. */
  undo: string | null;
  /** Populated by operations that create something. */
  created?: { name?: string; sceneItemId?: string; sourceId?: string };
}

type CommandArgs = unknown[];

function selectionResourceId(sceneId: string, nodeIds: string[] = []): string {
  // ExternalApiService.getResource splits on the first '[' and JSON.parses the remainder
  // as a constructor argument array, so this must serialise as InternalSelection["id",[...]].
  return `InternalSelection${JSON.stringify([sceneId, nodeIds])}`;
}

/** A Selection argument, deserialized back into a real internal Selection by rpc-api.ts. */
function selectionArg(sceneId: string, nodeIds: string[]) {
  return { _type: 'HELPER', resourceId: selectionResourceId(sceneId, nodeIds) };
}

export class Commands {
  constructor(private client: DesktopClient) {}

  // ------------------------------------------------------------------ core

  private async executeCommand(name: string, args: CommandArgs): Promise<unknown> {
    log(`command ${name}`);
    return this.client.request('EditorCommandsService', 'executeCommand', [name, ...args]);
  }

  /** The description the app will show for Ctrl+Z, read back after the command runs. */
  private async lastUndoDescription(): Promise<string | null> {
    try {
      const d = await this.client.request<string>('EditorCommandsService', 'nextUndoDescription');
      return d || null;
    } catch {
      return null;
    }
  }

  private async run(
    name: string,
    args: CommandArgs,
    created?: EditResult['created'],
  ): Promise<EditResult> {
    const ret = await this.executeCommand(name, args);
    const undo = await this.lastUndoDescription();
    const madeThing = created ?? extractCreated(ret);
    return { applied: true, undo, ...(madeThing ? { created: madeThing } : {}) };
  }

  async undoLast(): Promise<{ undone: string | null }> {
    const description = await this.lastUndoDescription();
    if (!description) return { undone: null };
    await this.client.request('EditorCommandsService', 'undo');
    return { undone: description };
  }

  // ------------------------------------------------------------- transforms

  /**
   * Absolute transform. MoveItemsCommand takes a DELTA and ResizeItemsCommand takes a
   * MULTIPLIER about a relative origin (selection.ts:510), so both are derived from the
   * item's current state. Resize runs first, about the top-left, so it does not move the
   * item out from under the subsequent position delta.
   */
  async setItemTransform(
    scene: SceneRef,
    item: ItemRef,
    target: {
      position?: { x?: number; y?: number };
      scale?: { x: number; y: number };
      rotation?: number;
    },
    current: { position: { x: number; y: number }; scale: { x: number; y: number } },
  ): Promise<EditResult> {
    const sel = selectionArg(scene.id, [item.sceneItemId]);
    let undo: string | null = null;

    if (target.scale) {
      const deltaScale = {
        x: current.scale.x !== 0 ? target.scale.x / current.scale.x : 1,
        y: current.scale.y !== 0 ? target.scale.y / current.scale.y : 1,
      };
      if (Math.abs(deltaScale.x - 1) > 1e-6 || Math.abs(deltaScale.y - 1) > 1e-6) {
        // Origin {0,0} scales about the top-left, leaving position untouched.
        await this.executeCommand('ResizeItemsCommand', [sel, deltaScale, { x: 0, y: 0 }]);
        undo = await this.lastUndoDescription();
      }
    }

    if (target.position) {
      const delta = {
        x: (target.position.x ?? current.position.x) - current.position.x,
        y: (target.position.y ?? current.position.y) - current.position.y,
      };
      if (delta.x !== 0 || delta.y !== 0) {
        await this.executeCommand('MoveItemsCommand', [sel, delta]);
        undo = await this.lastUndoDescription();
      }
    }

    if (target.rotation !== undefined) {
      await this.executeCommand('RotateItemsCommand', [sel, target.rotation]);
      undo = await this.lastUndoDescription();
    }

    return { applied: true, undo };
  }

  async fitToScreen(scene: SceneRef, item: ItemRef): Promise<EditResult> {
    return this.run('FitToScreenCommand', [selectionArg(scene.id, [item.sceneItemId])]);
  }

  async stretchToScreen(scene: SceneRef, item: ItemRef): Promise<EditResult> {
    return this.run('StretchToScreenCommand', [selectionArg(scene.id, [item.sceneItemId])]);
  }

  async centerOnScreen(scene: SceneRef, item: ItemRef): Promise<EditResult> {
    // ECenteringType.Screen === 'screen' (center-items.ts:6)
    return this.run('CenterItemsCommand', [selectionArg(scene.id, [item.sceneItemId]), 'screen']);
  }

  async resetTransform(scene: SceneRef, item: ItemRef): Promise<EditResult> {
    return this.run('ResetTransformCommand', [selectionArg(scene.id, [item.sceneItemId])]);
  }

  // ------------------------------------------------------------- visibility

  async setVisibility(scene: SceneRef, item: ItemRef, visible: boolean): Promise<EditResult> {
    // HideItemsCommand's second argument is `hidden`, not `visible` (hide-items.ts:20).
    return this.run('HideItemsCommand', [selectionArg(scene.id, [item.sceneItemId]), !visible]);
  }

  // ---------------------------------------------------------------- z-order

  /** placeType is EPlaceType: 'after' | 'before' | 'inside' (reorder-nodes.ts:5). */
  async reorder(
    scene: SceneRef,
    item: ItemRef,
    destinationNodeId: string,
    placeType: 'after' | 'before' | 'inside',
  ): Promise<EditResult> {
    return this.run('ReorderNodesCommand', [
      selectionArg(scene.id, [item.sceneItemId]),
      destinationNodeId,
      placeType,
    ]);
  }

  async groupItems(scene: SceneRef, name: string, nodeIds: string[]): Promise<EditResult> {
    return this.run('CreateFolderCommand', [scene.id, name, selectionArg(scene.id, nodeIds)]);
  }

  // ---------------------------------------------------------------- removal

  async removeItem(scene: SceneRef, item: ItemRef): Promise<EditResult> {
    return this.run('RemoveNodesCommand', [selectionArg(scene.id, [item.sceneItemId])]);
  }

  async removeSource(sourceId: string): Promise<EditResult> {
    return this.run('RemoveSourceCommand', [sourceId]);
  }

  // ---------------------------------------------------------------- sources

  /**
   * CreateNewItemCommand.execute() dereferences options.sourceAddOptions unconditionally
   * (create-new-item.ts:49), so the options object MUST carry it -- both in-app callers do
   * (AddSource.tsx:150, widgets.ts:193). Omitting it is a TypeError, not a default.
   */
  async addSource(
    scene: SceneRef,
    name: string,
    type: string,
    settings?: Record<string, unknown>,
  ): Promise<EditResult> {
    return this.run('CreateNewItemCommand', [
      scene.id,
      name,
      type,
      settings ?? null,
      { sourceAddOptions: {} },
    ]);
  }

  async addExistingSource(scene: SceneRef, sourceId: string): Promise<EditResult> {
    return this.run('CreateExistingItemCommand', [scene.id, sourceId]);
  }

  async renameSource(sourceId: string, name: string): Promise<EditResult> {
    return this.run('RenameSourceCommand', [sourceId, name]);
  }

  async setSourceSettings(
    sourceId: string,
    settings: Record<string, unknown>,
  ): Promise<EditResult> {
    return this.run('EditSourceSettingsCommand', [sourceId, settings]);
  }

  // ---------------------------------------------------------------- filters

  async addFilter(
    sourceId: string,
    filterType: string,
    filterName: string,
    settings?: Record<string, unknown>,
  ): Promise<EditResult> {
    return this.run('AddFilterCommand', [sourceId, filterType, filterName, settings ?? null], {
      name: filterName,
    });
  }

  async removeFilter(sourceId: string, filterName: string): Promise<EditResult> {
    return this.run('RemoveFilterCommand', [sourceId, filterName]);
  }

  // ----------------------------------------------------------------- scenes

  async createScene(name: string, duplicateFromSceneId?: string): Promise<EditResult> {
    const options = duplicateFromSceneId ? { duplicateItemsFromScene: duplicateFromSceneId } : {};
    return this.run('CreateSceneCommand', [name, options], { name });
  }

  async renameScene(sceneId: string, name: string): Promise<EditResult> {
    return this.run('RenameSceneCommand', [sceneId, name]);
  }

  async removeScene(sceneId: string): Promise<EditResult> {
    return this.run('RemoveSceneCommand', [sceneId]);
  }

  async switchScene(sceneId: string): Promise<void> {
    // Not an editor command in the app either -- switching is not undoable there.
    await this.client.request('ScenesService', 'makeSceneActive', [sceneId]);
  }

  // ------------------------------------------------------------------ audio

  async setMuted(sourceId: string, muted: boolean): Promise<EditResult> {
    return this.run('MuteSourceCommand', [sourceId, muted]);
  }

  async setDeflection(sourceId: string, deflection: number): Promise<EditResult> {
    return this.run('SetDeflectionCommand', [sourceId, deflection]);
  }
}

/** Commands that create something return the new HELPER; pull the useful ids out of it. */
function extractCreated(value: unknown): EditResult['created'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const out: EditResult['created'] = {};
  if (typeof v.name === 'string') out.name = v.name;
  if (typeof v.sceneItemId === 'string') out.sceneItemId = v.sceneItemId;
  else if (typeof v.id === 'string') out.sceneItemId = v.id;
  if (typeof v.sourceId === 'string') out.sourceId = v.sourceId;
  return Object.keys(out).length ? out : undefined;
}
