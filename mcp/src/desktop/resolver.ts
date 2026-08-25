/**
 * Human name -> resourceId resolution.
 *
 * The model never sees `Scene["scene_a8fc..."]` or the three-arg
 * `SceneItem["sceneId", "nodeId", "sourceId"]`. Those invite quote-escaping errors,
 * argument transposition and hallucinated ids, and cost ~40 tokens per object per turn.
 *
 * On ambiguity we error with the candidate list; on a miss we error with the available
 * names. Both turn a dead end into a self-correcting next turn.
 */

import { DesktopClient } from './client.js';
import { log } from '../log.js';
import { isHelper } from './types.js';

const CACHE_TTL_MS = 30_000;

export class ResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolutionError';
  }
}

export interface SceneRef {
  id: string;
  name: string;
  resourceId: string;
}

export interface ItemRef {
  resourceId: string;
  name: string;
  sceneItemId: string;
  sourceId: string;
}

export interface SourceRef {
  sourceId: string;
  name: string;
  type: string;
  width: number;
  height: number;
  audio: boolean;
  resourceId: string;
}

interface ScenesState {
  activeSceneId: string;
  displayOrder: string[];
  scenes: Record<string, { id: string; name: string }>;
}

/**
 * exact -> case-insensitive -> trimmed -> unique substring.
 * Returns the single match, or throws with actionable candidates.
 */
function matchByName<T>(
  needle: string,
  candidates: T[],
  nameOf: (t: T) => string,
  kindLabel: string,
): T {
  if (candidates.length === 0) {
    throw new ResolutionError(`There are no ${kindLabel}s available.`);
  }

  const want = needle.trim();
  const exact = candidates.filter(c => nameOf(c) === want);
  if (exact.length === 1) return exact[0];

  const ci = candidates.filter(c => nameOf(c).toLowerCase() === want.toLowerCase());
  if (ci.length === 1) return ci[0];

  const trimmed = candidates.filter(c => nameOf(c).trim().toLowerCase() === want.toLowerCase());
  if (trimmed.length === 1) return trimmed[0];

  const sub = candidates.filter(c => nameOf(c).toLowerCase().includes(want.toLowerCase()));
  if (sub.length === 1) return sub[0];

  const names = candidates.map(nameOf);
  if (sub.length > 1) {
    throw new ResolutionError(
      `Ambiguous ${kindLabel} "${needle}" — matches ${JSON.stringify(sub.map(nameOf))}. ` +
        `Use the exact name.`,
    );
  }
  throw new ResolutionError(
    `No ${kindLabel} named "${needle}". Available: ${JSON.stringify(names)}.`,
  );
}

export class Resolver {
  private scenesCache: { at: number; state: ScenesState } | null = null;
  private sourcesCache: { at: number; sources: SourceRef[] } | null = null;

  constructor(private client: DesktopClient) {
    // Any structural change drops the caches. The 30s TTL is only a backstop.
    client.onEvent(e => {
      const id = e.resourceId;
      if (
        id.startsWith('ScenesService.') ||
        id.startsWith('SceneCollectionsService.') ||
        id.startsWith('SourcesService.')
      ) {
        this.invalidate();
      }
    });
    client.onReconnect(() => this.invalidate());
  }

  invalidate(): void {
    this.scenesCache = null;
    this.sourcesCache = null;
  }

  /** One free call returning the whole scene graph (no @Expensive decorator on it). */
  private async scenesState(): Promise<ScenesState> {
    const now = Date.now();
    if (this.scenesCache && now - this.scenesCache.at < CACHE_TTL_MS) {
      return this.scenesCache.state;
    }
    const state = await this.client.request<ScenesState>('ScenesService', 'state');
    this.scenesCache = { at: now, state };
    return state;
  }

  async sources(): Promise<SourceRef[]> {
    const now = Date.now();
    if (this.sourcesCache && now - this.sourcesCache.at < CACHE_TTL_MS) {
      return this.sourcesCache.sources;
    }
    const raw = await this.client.request<unknown[]>('SourcesService', 'getSources');
    const sources: SourceRef[] = (raw ?? []).filter(isHelper).map(h => ({
      sourceId: String(h.sourceId ?? h.id ?? ''),
      name: String(h.name ?? ''),
      type: String(h.type ?? ''),
      width: Number(h.width ?? 0),
      height: Number(h.height ?? 0),
      audio: Boolean(h.audio),
      resourceId: h.resourceId,
    }));
    this.sourcesCache = { at: now, sources };
    return sources;
  }

  async sceneList(): Promise<SceneRef[]> {
    const state = await this.scenesState();
    const order = state.displayOrder?.length ? state.displayOrder : Object.keys(state.scenes ?? {});
    return order
      .map(id => state.scenes?.[id])
      .filter(Boolean)
      .map(s => ({ id: s.id, name: s.name, resourceId: `Scene["${s.id}"]` }));
  }

  async activeScene(): Promise<SceneRef> {
    const state = await this.scenesState();
    const s = state.scenes?.[state.activeSceneId];
    if (!s) throw new ResolutionError('No active scene.');
    return { id: s.id, name: s.name, resourceId: `Scene["${s.id}"]` };
  }

  /** `undefined` / empty resolves to the active scene. */
  async resolveScene(name?: string): Promise<SceneRef> {
    if (!name || !name.trim()) return this.activeScene();
    // Escape hatch: a literal resourceId passes straight through.
    if (/^Scene\[/.test(name)) {
      const id = JSON.parse(name.slice('Scene'.length))[0];
      return { id, name, resourceId: name };
    }
    const scenes = await this.sceneList();
    return matchByName(name, scenes, s => s.name, 'scene');
  }

  /**
   * Items are resolved against a live getItems() call rather than the cached graph,
   * because we want the exact resourceId the API hands back.
   */
  async resolveItem(itemName: string, sceneName?: string): Promise<{ scene: SceneRef; item: ItemRef }> {
    const scene = await this.resolveScene(sceneName);

    if (/^SceneItem\[/.test(itemName)) {
      return {
        scene,
        item: { resourceId: itemName, name: itemName, sceneItemId: '', sourceId: '' },
      };
    }

    const items = await this.sceneItems(scene);
    const item = matchByName(itemName, items, i => i.name, `item in scene "${scene.name}"`);
    return { scene, item };
  }

  async sceneItems(scene: SceneRef): Promise<ItemRef[]> {
    const raw = await this.client.request<unknown[]>(scene.resourceId, 'getItems');
    return (raw ?? []).filter(isHelper).map(h => ({
      resourceId: h.resourceId,
      name: String(h.name ?? ''),
      sceneItemId: String(h.sceneItemId ?? h.id ?? ''),
      sourceId: String(h.sourceId ?? ''),
    }));
  }

  /** Audio sources are addressed by source name, scoped to the whole app. */
  async resolveAudioSource(name: string): Promise<{ resourceId: string; name: string }> {
    if (/^AudioSource\[/.test(name)) return { resourceId: name, name };

    const raw = await this.client.request<unknown[]>('AudioService', 'getSources');
    const audio = (raw ?? []).filter(isHelper).map(h => ({
      resourceId: h.resourceId,
      name: String(h.name ?? ''),
    }));
    return matchByName(name, audio, a => a.name, 'audio source');
  }
}
