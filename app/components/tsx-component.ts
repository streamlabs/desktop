import Vue from 'vue';

export function createProps<TProps extends new () => any>(
  propsClass: TProps,
): Dictionary<{ default: any }> {
  const propsObj: Dictionary<any> = {};
  const props = new propsClass();
  Object.keys(props).forEach((key: string) => {
    propsObj[key] = { default: props[key] };
  });
  return propsObj;
}

/**
 * Sets an inital value for the required prop
 * Helps to avoid typescript errors in strict-nulls mode when declare a shape of the props object
 * @example
 * <pre>
 *
 * class MyComponentProps() {
 *   myProp: string = required<string>()
 * }
 *
 * </pre>
 */
export function required<TPropType>() {
  return null as unknown as TPropType;
}

export default abstract class TsxComponent<TProps extends Dictionary<any> = {}> extends Vue {
  private vueTsxProps: Readonly<{
    slot?: string;
    ref?: string;
    class?: string;
    key?: string;
    style?: string | Dictionary<string>;
    vModel?: unknown;
    scopedSlots?: Dictionary<Function>;
    name?: string;
  }> &
    Readonly<TProps>;

  get props(): TProps {
    return this.$props as Readonly<TProps>;
  }
}
