import uuid from 'uuid/v4';
import { Properties, PropertyInstance, PropertyMap } from './properties';
import { Instructions, interpolateInstruction } from './instructions';
import type { TCondition } from './conditions';
import type { GameState } from './game-state';

export type ResolveFromIdOrName = { name: string; id?: never } | { id: string; name?: never };

export type SceneRef = { id: string; name: string };
export type SourceRef = { id: string; name: string };

export type ActionContext = {
  resolveSceneId: (scene: ResolveFromIdOrName) => Promise<SceneRef>;
  resolveSourceId: (source: ResolveFromIdOrName) => Promise<SourceRef>;
  switchScene: (id: string) => void;
  setSourceVisible: (id: string, visible: boolean) => void;
  saveReplay: () => Promise<void>;
  sendInstruction: (instruction: string) => void;
  sendSimulationBark: (conditionType: string) => void;
};

export type ActionProps = {
  scene?: { id: string };
  source?: { id: string };
  show_if_condition_false?: boolean;
  hide_if_condition_false?: boolean;
  duration?: number;
  instruction?: string;
  say?: string;
  simulating?: boolean;
};

export type ExportedActionProps = {
  scene?: { name: string };
  source?: { name: string };
  show_if_condition_false?: boolean;
  hide_if_condition_false?: boolean;
  duration?: number;
  instruction?: string;
  say?: string;
};

type ActionProcessPayload = {
  conditionsMet: boolean;
  conditions: TCondition[];
  context: ActionContext;
  props?: ActionProps;
  state: GameState;
  prevState: GameState;
};

export type ActionDef = {
  group: string;
  name: string;
  label: string;
  properties?: PropertyMap;
  process: (payload: ActionProcessPayload) => Promise<void>;
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const ActionRegistry = {
  'common.switch_to_scene': {
    group: 'common',
    name: 'switch_to_scene',
    label: 'Switch to Scene',
    properties: {
      scene: new Properties.Scene({ label: 'Scene' }),
    },
    process: async ({ conditionsMet, props, context }: ActionProcessPayload) => {
      if (!conditionsMet || !props?.scene) return;
      context.switchScene(props.scene.id);
    },
  },

  'common.hide_source': {
    group: 'common',
    name: 'hide_source',
    label: 'Hide Source',
    properties: {
      source: new Properties.Source({ label: 'Source' }),
      show_if_condition_false: new Properties.Checkbox({ label: 'Show if condition is false' }),
    },
    process: async ({ conditionsMet, props, context }: ActionProcessPayload) => {
      if (!props?.source) return;
      if (!conditionsMet) {
        if (props.show_if_condition_false) {
          context.setSourceVisible(props.source.id, true);
        }
        return;
      }
      context.setSourceVisible(props.source.id, false);
    },
  },

  'common.show_source': {
    group: 'common',
    name: 'show_source',
    label: 'Show Source',
    properties: {
      source: new Properties.Source({ label: 'Source' }),
      hide_if_condition_false: new Properties.Checkbox({ label: 'Hide if condition is false' }),
    },
    process: async ({ conditionsMet, props, context }: ActionProcessPayload) => {
      if (!props?.source) return;
      if (!conditionsMet) {
        if (props.hide_if_condition_false) {
          context.setSourceVisible(props.source.id, false);
        }
        return;
      }
      context.setSourceVisible(props.source.id, true);
    },
  },

  'common.save_replay': {
    group: 'common',
    name: 'save_replay',
    label: 'Save Replay',
    process: async ({ conditionsMet, context }: ActionProcessPayload) => {
      if (!conditionsMet) return;
      await context.saveReplay();
    },
  },

  'common.wait_for_ms': {
    group: 'common',
    name: 'wait_for_ms',
    label: 'Wait',
    properties: {
      duration: new Properties.Slider({
        label: 'Duration',
        min: 500,
        max: 60000,
        default: 5000,
        step: 500,
        format: (ms: number) => `${(ms / 1000).toFixed(1)} ${ms === 1000 ? 'second' : 'seconds'}`,
      }),
    },
    process: async ({ conditionsMet, props }: ActionProcessPayload) => {
      if (!conditionsMet || typeof props?.duration !== 'number') return;
      await sleep(props.duration);
    },
  },

  'co-host.comment': {
    group: 'co-host',
    name: 'comment',
    label: 'Co-host Comment',
    properties: {},
    process: async ({ conditionsMet, conditions, context, state, props }: ActionProcessPayload) => {
      if (!conditionsMet) return;
      for (const c of conditions) {
        if (props?.simulating) {
          context.sendSimulationBark(c.type);
        } else {
          const template = Instructions[c.type as keyof typeof Instructions];
          if (!template) continue;
          const instruction = interpolateInstruction(template, state);
          console.log('[AutomationsEngine] co-host.comment', { condition: c.type, instruction });
          context.sendInstruction(instruction);
        }
      }
    },
  },

  'co-host.instruction': {
    group: 'co-host',
    name: 'instruction',
    label: 'Co-host Instruction',
    properties: {
      instruction: new Properties.Text({ label: 'Instruction' }),
    },
    process: async ({ conditionsMet, props, context }: ActionProcessPayload) => {
      if (!conditionsMet || !props?.instruction || props?.simulating) return;
      console.log('[AutomationsEngine] co-host.instruction', { instruction: props.instruction });
      context.sendInstruction(props.instruction);
    },
  },
} as const;

export type ActionType = keyof typeof ActionRegistry;

export type Action = {
  id: string;
  type: ActionType;
  props?: ActionProps;
};

export type ExportedAction = {
  type: ActionType;
  props?: ExportedActionProps;
};

/**
 * Reads the registry's property defaults for an action type into exported-props
 * shape (e.g. wait_for_ms's 5000ms duration). Only primitive properties define
 * defaults, and their exported form equals their internal form, so the config
 * default can be used directly.
 */
export function defaultExportedProps(type: ActionType): ExportedActionProps | undefined {
  const def = ActionRegistry[type];
  if (!('properties' in def) || !def.properties) return undefined;

  const props: Partial<ExportedActionProps> = {};
  for (const [key, property] of Object.entries(
    def.properties as Record<string, PropertyInstance>,
  )) {
    const value = (property as any).config?.default;
    if (value !== undefined) props[key as keyof ExportedActionProps] = value as never;
  }

  return Object.keys(props).length ? (props as ExportedActionProps) : undefined;
}

/**
 * Ensures an action carries its property defaults so they are persisted rather
 * than only shown as a UI placeholder. Existing props win over defaults.
 */
export function withActionDefaults(action: ExportedAction): ExportedAction {
  const defaults = defaultExportedProps(action.type);
  if (!defaults) return action;
  return { ...action, props: { ...defaults, ...action.props } };
}

const valueFromExport = (
  property: PropertyInstance,
  v: unknown,
  context: ActionContext,
): Promise<unknown> | unknown => (property as any).valueFromExport(v, context);

const valueToExport = (
  property: PropertyInstance,
  v: unknown,
  context: ActionContext,
): Promise<unknown> | unknown => (property as any).valueToExport(v, context);

const importAction = async (exported: ExportedAction, context: ActionContext): Promise<Action> => {
  const def = ActionRegistry[exported.type];
  if (!def) throw new Error(`Action ${exported.type} not found`);

  if (!('properties' in def) || !def.properties) {
    return { id: uuid(), type: exported.type };
  }

  const props: Partial<ActionProps> = {};
  for (const [key, property] of Object.entries(
    def.properties as Record<string, PropertyInstance>,
  )) {
    const propValue = exported.props?.[key as keyof ExportedActionProps] as unknown;
    props[key as keyof ActionProps] = (await valueFromExport(
      property,
      propValue,
      context,
    )) as never;
  }

  return {
    id: uuid(),
    type: exported.type,
    props: Object.keys(props).length ? (props as ActionProps) : undefined,
  };
};

const exportAction = async (action: Action, context: ActionContext): Promise<ExportedAction> => {
  const def = ActionRegistry[action.type];
  if (!def) throw new Error(`Action ${action.type} not found`);

  if (!('properties' in def) || !def.properties) {
    return { type: action.type };
  }

  const props: Partial<ExportedActionProps> = {};
  for (const [key, property] of Object.entries(
    def.properties as Record<string, PropertyInstance>,
  )) {
    const propValue = action.props?.[key as keyof ActionProps] as unknown;
    props[key as keyof ExportedActionProps] = (await valueToExport(
      property,
      propValue,
      context,
    )) as never;
  }

  return {
    type: action.type,
    props: Object.keys(props).length ? (props as ExportedActionProps) : undefined,
  };
};

export class Actions {
  static async fromExported(exported: ExportedAction[], context: ActionContext): Promise<Action[]> {
    return Promise.all(exported.map(a => importAction(a, context)));
  }

  static async toExported(actions: Action[], context: ActionContext): Promise<ExportedAction[]> {
    return Promise.all(actions.map(a => exportAction(a, context)));
  }

  static async process({
    action,
    conditionsMet,
    conditions,
    context,
    state,
    prevState,
  }: {
    action: Action;
    conditionsMet: boolean;
    conditions: TCondition[];
    context: ActionContext;
    state: GameState;
    prevState: GameState;
  }) {
    const def = ActionRegistry[action.type];
    if (!def) throw new Error(`Action ${action.type} not found`);

    return def.process({
      conditionsMet,
      conditions,
      context,
      props: action.props,
      state,
      prevState,
    });
  }
}
