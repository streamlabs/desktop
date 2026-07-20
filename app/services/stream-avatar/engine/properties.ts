import type { ActionContext } from './actions';

type MaybePromise<T> = T | Promise<T>;

abstract class PropertyBase<T, Config extends Record<string, any> & { default?: T }, E = T> {
  value: T;
  config: Config;

  constructor(config: Config) {
    this.config = config;
    this.value = config?.default as T;
  }

  valueFromExport(v: E, _context: ActionContext): MaybePromise<T> {
    return (v as unknown) as T;
  }
  valueToExport(v: T, _context: ActionContext): MaybePromise<E> {
    return (v as unknown) as E;
  }
}

class SceneProperty extends PropertyBase<{ id: string }, { label: string }, { name: string }> {
  valueFromExport(v: { name: string }, { resolveSceneId }: ActionContext) {
    return resolveSceneId(v).then(scene => ({ id: scene.id }));
  }
  valueToExport(v: { id: string }, { resolveSceneId }: ActionContext) {
    return resolveSceneId(v).then(scene => ({ name: scene.name }));
  }
}

class SourceProperty extends PropertyBase<{ id: string }, { label: string }, { name: string }> {
  valueFromExport(v: { name: string }, { resolveSourceId }: ActionContext) {
    return resolveSourceId(v).then(source => ({ id: source.id }));
  }
  valueToExport(v: { id: string }, { resolveSourceId }: ActionContext) {
    return resolveSourceId(v).then(source => ({ name: source.name }));
  }
}

class SliderProperty extends PropertyBase<
  number,
  {
    label: string;
    default: number;
    min: number;
    max: number;
    step: number;
    format?: (v: number) => string;
  }
> {}

class SliderRangeProperty extends PropertyBase<
  [number, number],
  {
    label: string;
    default: [number, number];
    min: number;
    max: number;
    step: number;
    format?: (v: [number, number]) => string;
  }
> {}

class CheckboxProperty extends PropertyBase<boolean, { label: string }> {}

class TextProperty extends PropertyBase<string, { label: string }> {
  valueFromExport(v: string) {
    return v;
  }
  valueToExport(v: string) {
    return v;
  }
}

export const Properties = {
  Scene: SceneProperty,
  Source: SourceProperty,
  Slider: SliderProperty,
  SliderRange: SliderRangeProperty,
  Checkbox: CheckboxProperty,
  Text: TextProperty,
} as const;

export type PropertyMap = Record<string, PropertyInstance> | undefined;
export type PropertyInstance = InstanceType<typeof Properties[keyof typeof Properties]>;
