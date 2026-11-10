import type { ExportedAction } from './actions';
import type { IAvailableResources } from './validation';

type TScopeResources = Pick<IAvailableResources, 'sources' | 'sceneSourceNames'>;

/**
 * The scenes whose items a Show/Hide Source reaction can pick from: the target of the nearest
 * Switch to Scene above it (skipping switches with no scene picked), else the automation's
 * Limit to Scene list, else none (Any Scene). Sources are saved by name, and the runtime acts on
 * whichever scene is active when the reaction runs, which is one of these.
 */
export function sourceScopeScenes(
  actions: ExportedAction[],
  index: number,
  limitScenes?: string[],
): string[] {
  for (let i = index - 1; i >= 0; i--) {
    const action = actions[i];
    if (action?.type !== 'common.switch_to_scene') continue;

    // Untrimmed, to match scene names exactly as the runtime and `sceneSourceNames` do.
    const name = action.props?.scene?.name;
    if (name) return [name];
  }

  return (limitScenes ?? []).filter(Boolean);
}

/**
 * The names a reaction scoped to `scopeScenes` is limited to (the union across them), or
 * `undefined` when nothing limits it: Any Scene, no per-scene data, or only scenes that no longer
 * exist. Missing scenes get their own "no longer exists" error, so they don't also flag every
 * source after them. Validation and the editor both read it from here so they can't disagree.
 */
export function scopedSourceNames(
  scopeScenes: string[],
  resources: Pick<IAvailableResources, 'sceneSourceNames'>,
): string[] | undefined {
  const byScene = resources.sceneSourceNames;
  if (!byScene) return undefined;

  const known = scopeScenes.filter(scene => Object.prototype.hasOwnProperty.call(byScene, scene));
  if (!known.length) return undefined;

  return Array.from(new Set(known.flatMap(scene => byScene[scene])));
}

/** The source names a reaction scoped to `scopeScenes` can pick, unique and in listed order. */
export function allowedSourceNames(scopeScenes: string[], resources: TScopeResources): string[] {
  const names = scopedSourceNames(scopeScenes, resources) ?? resources.sources.map(s => s.name);
  return Array.from(new Set(names));
}
