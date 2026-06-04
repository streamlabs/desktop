import { $t } from 'services/i18n';
import { Conditions } from './conditions';
import type { TAutomationExport } from './automations';
import type { ExportedAction, ExportedActionProps } from './actions';

/** A scene or source that currently exists in the active scene collection. */
export interface IResourceRef {
  id: string;
  name: string;
}

/** Live scenes/sources used to detect deleted or unavailable references. */
export interface IAvailableResources {
  scenes: IResourceRef[];
  sources: IResourceRef[];
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

/**
 * Translates `key` and substitutes `%{name}` placeholders. VueI18n only
 * interpolates keys that exist in the dictionary; these strings are new and not
 * synced yet, so we fill any placeholders left in the returned key ourselves.
 */
function t(key: string, vars?: Record<string, string | number>): string {
  const translated = vars ? $t(key, vars) : $t(key);
  if (!vars) return translated;
  return translated.replace(/%\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match,
  );
}

function validateAction(
  action: ExportedAction,
  index: number,
  resources: IAvailableResources,
): IAutomationIssue[] {
  const issues: IAutomationIssue[] = [];
  const props = (action?.props ?? {}) as ExportedActionProps;

  const actionIssue = (field: string, message: string): IAutomationIssue => ({
    scope: 'action',
    actionIndex: index,
    field,
    message,
  });

  switch (action?.type) {
    case 'common.switch_to_scene': {
      const name = props.scene?.name?.trim();
      if (!name) {
        issues.push(actionIssue('scene', $t('Select a scene to switch to.')));
      } else if (!resources.scenes.some(s => s.name === name)) {
        issues.push(actionIssue('scene', t('Scene "%{name}" no longer exists.', { name })));
      }
      break;
    }

    case 'common.show_source':
    case 'common.hide_source': {
      const name = props.source?.name?.trim();
      if (!name) {
        issues.push(actionIssue('source', $t('Select a source.')));
      } else if (!resources.sources.some(s => s.name === name)) {
        issues.push(actionIssue('source', t('Source "%{name}" is unavailable.', { name })));
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
            t('Instruction must be %{max} characters or fewer.', {
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
      message: t('Description must be %{max} characters or fewer.', {
        max: MAX_DESCRIPTION_LENGTH,
      }),
    });
  }

  if (!automation.conditions?.length) {
    issues.push({ scope: 'conditions', message: $t('Select a condition.') });
  } else if (
    automation.conditions.some(c => !c?.type || !Conditions[c.type as keyof typeof Conditions])
  ) {
    issues.push({ scope: 'conditions', message: $t('This automation uses an unknown condition.') });
  }

  const validActions = (automation.actions ?? []).filter(a => a?.type);
  if (!validActions.length) {
    issues.push({ scope: 'action', message: $t('Add at least one action.') });
  }

  (automation.actions ?? []).forEach((action, index) => {
    issues.push(...validateAction(action, index, resources));
  });

  return issues;
}

export function isAutomationValid(
  automation: TAutomationExport,
  resources: IAvailableResources,
): boolean {
  return validateAutomation(automation, resources).length === 0;
}
