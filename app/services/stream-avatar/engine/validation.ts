import { $t } from 'services/i18n';
import { areStreamEventsOnly, Conditions } from './conditions';
import type { ConditionType } from './conditions';
import { ActionRegistry } from './actions';
import type { TAutomationExport } from './automations';
import type { ExportedActionProps } from './actions';
import { scenesInScope, scopedSourceNames, sourceScopes } from './source-scope';

/** A scene or source that currently exists in the active scene collection. */
export interface IResourceRef {
  id: string;
  name: string;
}

/** Live scenes/sources used to detect deleted or unavailable references. */
export interface IAvailableResources {
  scenes: IResourceRef[];
  sources: IResourceRef[];
  /**
   * Unique video-source names of each scene's direct items, keyed by scene name, for the scenes
   * of Limit to Scene. Same-named scenes are merged, as that limit matches the active scene by
   * name. When given with `switchSceneSourceNames`, Show/Hide Source reactions must pick a
   * source from their scope scene (see `source-scope`).
   */
  sceneSourceNames?: Record<string, string[]>;
  /**
   * Like `sceneSourceNames`, for the target of a Switch to Scene. That switches to the first
   * scene with the name, so same-named scenes after it don't count.
   */
  switchSceneSourceNames?: Record<string, string[]>;
  /** Whether the Sidekick app is installed AND enabled, gating co-host actions. */
  agentAppReady?: boolean;
}

/** Where an issue applies, so the editor can render it next to the right field. */
export type TIssueScope = 'description' | 'conditions' | 'action';

export interface IAutomationIssue {
  scope: TIssueScope;
  /** Index into `automation.actions` when scope === 'action'. */
  actionIndex?: number;
  /** The offending prop, e.g. 'scene' | 'source' | 'instruction'. */
  field?: string;
  message: string;
}

export const MAX_DESCRIPTION_LENGTH = 100;
export const MAX_INSTRUCTION_LENGTH = 128;

function validateAction(
  automation: TAutomationExport,
  index: number,
  resources: IAvailableResources,
): IAutomationIssue[] {
  const action = automation.actions[index];
  const issues: IAutomationIssue[] = [];
  const props = (action?.props ?? {}) as ExportedActionProps;

  const actionIssue = (field: string, message: string): IAutomationIssue => ({
    scope: 'action',
    actionIndex: index,
    field,
    message,
  });

  if (
    action?.type &&
    ActionRegistry()[action.type]?.group === 'co-host' &&
    resources.agentAppReady === false
  ) {
    issues.push(actionIssue('type', $t('Requires the Sidekick app to be installed and enabled.')));
  }

  switch (action?.type) {
    case 'common.switch_to_scene': {
      const name = props.scene?.name?.trim();
      if (!name) {
        issues.push(actionIssue('scene', $t('Select a scene to switch to.')));
      } else if (!resources.scenes.some(s => s.name === name)) {
        issues.push(actionIssue('scene', $t('Scene "%{name}" no longer exists.', { name })));
      }
      break;
    }

    case 'common.show_source':
    case 'common.hide_source': {
      const name = props.source?.name?.trim();
      if (!name) {
        issues.push(actionIssue('source', $t('Select a source.')));
      } else if (!resources.sources.some(s => s.name === name)) {
        issues.push(actionIssue('source', $t('Source "%{name}" is unavailable.', { name })));
      } else {
        const scopes = sourceScopes(
          automation.actions,
          index,
          automation.scenes,
          areStreamEventsOnly(automation.conditions),
        );
        // Undefined when nothing limits the choices (see scopedSourceNames).
        const inScope = scopedSourceNames(scopes, resources);
        if (inScope && !inScope.includes(name)) {
          const scenes = scenesInScope(scopes);
          issues.push(
            actionIssue(
              'source',
              scenes.length > 1
                ? $t('Source "%{name}" isn\'t in any of the scenes %{scenes}.', {
                    name,
                    scenes: scenes.map(scene => `"${scene}"`).join(', '),
                  })
                : $t('Source "%{name}" isn\'t in scene "%{scene}".', { name, scene: scenes[0] }),
            ),
          );
        }
      }
      break;
    }

    case 'co-host.instruction': {
      const instruction = props.instruction?.trim();
      if (!instruction) {
        issues.push(actionIssue('instruction', $t('Enter an instruction for the co-host.')));
      } else if (instruction.length > MAX_INSTRUCTION_LENGTH) {
        issues.push(
          actionIssue(
            'instruction',
            $t('Instruction must be %{max} characters or fewer.', {
              max: MAX_INSTRUCTION_LENGTH,
            }),
          ),
        );
      }
      break;
    }

    default:
      break;
  }

  return issues;
}

/**
 * Validates an automation against the live scenes/sources. Returns every issue
 * found so the UI can both block submission and surface real-time errors (e.g.
 * a Switch Scene action pointing at a scene that has since been deleted).
 */
export function validateAutomation(
  automation: TAutomationExport,
  resources: IAvailableResources,
): IAutomationIssue[] {
  const issues: IAutomationIssue[] = [];

  const description = automation.description?.trim();
  if (!description) {
    issues.push({ scope: 'description', message: $t('Add a description.') });
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    issues.push({
      scope: 'description',
      message: $t('Description must be %{max} characters or fewer.', {
        max: MAX_DESCRIPTION_LENGTH,
      }),
    });
  }

  if (!automation.conditions?.length) {
    issues.push({ scope: 'conditions', message: $t('Select a condition.') });
  } else if (automation.conditions.some(c => !c?.type || !Conditions()[c.type as ConditionType])) {
    issues.push({ scope: 'conditions', message: $t('This automation uses an unknown condition.') });
  }

  const missingScene = automation.scenes?.find(
    name => !resources.scenes.some(s => s.name === name),
  );
  if (missingScene) {
    issues.push({
      scope: 'conditions',
      field: 'scene',
      message: $t('Scene "%{name}" no longer exists.', { name: missingScene }),
    });
  }

  const validActions = (automation.actions ?? []).filter(a => a?.type);
  if (!validActions.length) {
    issues.push({ scope: 'action', message: $t('Add at least one action.') });
  }

  (automation.actions ?? []).forEach((_, index) => {
    issues.push(...validateAction(automation, index, resources));
  });

  return issues;
}

export function isAutomationValid(
  automation: TAutomationExport,
  resources: IAvailableResources,
): boolean {
  return validateAutomation(automation, resources).length === 0;
}
