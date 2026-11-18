import type { ExportedAction } from './actions';
import type { IAvailableResources } from './validation';

type TScopeResources = Pick<
  IAvailableResources,
  'sources' | 'sceneSourceNames' | 'switchSceneSourceNames'
>;

/** Scene names an automation or reaction is limited to, and where that list came from. */
export interface ISourceScope {
  scenes: string[];
  /**
   * The scenes come from a Switch to Scene above the reaction. The runtime switches to the FIRST
   * scene with that name, so only that scene's items count. Limit to Scene instead matches the
   * active scene by name, which can be any of the scenes sharing it.
   */
  fromSwitch: boolean;
}

/**
 * The scene a Show/Hide Source reaction runs in when the conditions are met: the target of the
 * nearest Switch to Scene above it (skipping switches with no scene picked), else the
 * automation's Limit to Scene list, else none (Any Scene). Sources are saved by name, and the
 * runtime acts on whichever scene is active when the reaction runs, which is one of these.
 */
export function sourceScopeScenes(
  actions: ExportedAction[],
  index: number,
  limitScenes?: string[],
): ISourceScope {
  for (let i = index - 1; i >= 0; i--) {
    const action = actions[i];
    if (action?.type !== 'common.switch_to_scene') continue;

    // Untrimmed, to match scene names exactly as the runtime and `sceneSourceNames` do.
    const name = action.props?.scene?.name;
    if (name) return { scenes: [name], fromSwitch: true };
  }

  return { scenes: (limitScenes ?? []).filter(Boolean), fromSwitch: false };
}

/**
 * Whether the reaction also runs in the "unmet" pass, when the conditions stopped being met.
 * Switch to Scene is skipped then, but Show/Hide Source still acts when its "if condition is
 * false" checkbox is on. Stream events are pulses with no such pass, so the checkbox does nothing.
 */
function runsWhenUnmet(action: ExportedAction | undefined, streamEventsOnly: boolean): boolean {
  if (streamEventsOnly) return false;
  if (action?.type === 'common.show_source') return !!action.props?.hide_if_condition_false;
  if (action?.type === 'common.hide_source') return !!action.props?.show_if_condition_false;
  return false;
}

/**
 * Every scope a Show/Hide Source reaction can run in. That is the conditions-met scope, plus
 * Limit to Scene (or any scene) when the reaction also runs in the unmet pass after a switch,
 * since that pass never switched scenes.
 */
export function sourceScopes(
  actions: ExportedAction[],
  index: number,
  limitScenes: string[] | undefined,
  streamEventsOnly: boolean,
): ISourceScope[] {
  const scope = sourceScopeScenes(actions, index, limitScenes);
  if (!scope.fromSwitch || !runsWhenUnmet(actions[index], streamEventsOnly)) return [scope];

  return [scope, { scenes: (limitScenes ?? []).filter(Boolean), fromSwitch: false }];
}

/**
 * The scenes `scopes` are limited to, or none when any of them lets every scene through
 * (Any Scene), which is when nothing limits the reaction.
 */
export function scenesInScope(scopes: ISourceScope[]): string[] {
  if (scopes.some(scope => !scope.scenes.length)) return [];
  return Array.from(new Set(scopes.flatMap(scope => scope.scenes)));
}

/**
 * The names a reaction scoped to `scopes` is limited to (the union across them), or `undefined`
 * when nothing limits it: Any Scene, no per-scene data, or only scenes that no longer exist.
 * Missing scenes get their own "no longer exists" error, so they don't also flag every source
 * after them. Validation and the editor both read it from here so they can't disagree.
 */
export function scopedSourceNames(
  scopes: ISourceScope[],
  resources: Pick<IAvailableResources, 'sceneSourceNames' | 'switchSceneSourceNames'>,
): string[] | undefined {
  const names = new Set<string>();

  for (const scope of scopes) {
    const byScene = scope.fromSwitch
      ? resources.switchSceneSourceNames
      : resources.sceneSourceNames;
    if (!byScene) return undefined;

    // `hasOwnProperty.call` works on the prototype-free dictionaries the builder makes, and keeps
    // a scene named like an `Object.prototype` member from matching on a plain object.
    const known = scope.scenes.filter(scene =>
      Object.prototype.hasOwnProperty.call(byScene, scene),
    );
    if (!known.length) return undefined;

    for (const scene of known) byScene[scene].forEach(name => names.add(name));
  }

  return scopes.length ? Array.from(names) : undefined;
}

/** The source names a reaction scoped to `scopes` can pick, unique and in listed order. */
export function allowedSourceNames(scopes: ISourceScope[], resources: TScopeResources): string[] {
  const names = scopedSourceNames(scopes, resources) ?? resources.sources.map(s => s.name);
  return Array.from(new Set(names));
}
