/**
 * Shared code for inputs
 */
import React, { useEffect, useContext, ChangeEvent, FocusEvent, useCallback, useRef } from 'react';
import { FormContext } from './Form';
import { useDebounce, useThrottle } from '../../hooks';
import { useOnCreate, useForceUpdate, createFormBinding } from 'slap';
import uuid from 'uuid';
import { FormItemProps } from 'antd/lib/form';
import { CheckboxChangeEvent } from 'antd/lib/checkbox';
import { $t } from '../../../services/i18n';
import pick from 'lodash/pick';
import isEqual from 'lodash/isEqual';
import * as InputComponents from './inputList';

export type TInputType =
  | 'code'
  | 'color'
  | 'card'
  | 'text'
  | 'textarea'
  | 'number'
  | 'toggle'
  | 'checkbox'
  | 'autocomplete'
  | 'list'
  | 'mediaurl'
  | 'audiourl'
  | 'tags'
  | 'switch'
  | 'date'
  | 'slider'
  | 'image'
  | 'time'
  | 'file'
  | 'checkboxGroup';

export type TInputLayout = 'horizontal' | 'vertical' | 'inline';

export interface IInputCommonProps<TValue> {
  value?: TValue;
  defaultValue?: TValue;
  name?: string;
  nowrap?: boolean;
  onChange?: (val: TValue, ev?: ChangeEvent | CheckboxChangeEvent) => unknown;
  onInput?: (val: TValue, ev?: ChangeEvent | CheckboxChangeEvent) => unknown;
  required?: boolean;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  debounce?: number;
  throttle?: number;
  /**
   * true if the input is in the uncontrolled mode
   * all input components except text inputs are controlled by default
   * @see https://reactjs.org/docs/uncontrolled-components.html
   */
  uncontrolled?: boolean;
  layout?: TInputLayout;
  rules?: unknown[];
}

export type ValuesOf<T extends ReadonlyArray<string>> = T[number];
export declare type SingleType<MixType> = MixType extends (infer Single)[] ? Single : MixType;

export const layoutPresets = {
  horizontal: {
    labelCol: { span: 8 },
    wrapperCol: { span: 16 },
  },
  vertical: {
    labelCol: { span: 24 },
    wrapperCol: { span: 24 },
  },
};

/**
 * A helper type for input props
 */
export type TSlobsInputProps<
  // required props
  TCustomProps extends object, // custom input props defined for SLOBS
  TValue, // the input value type
  // optional props
  TAntProps = {}, // props of the antd input that is working under the hood
  TFeatures extends keyof Partial<TAntProps> = never // props of antd input that we support
> = TCreateSlobsInputProps<TCustomProps, TValue, TAntProps, TFeatures>;

/**
 * A private helper for creating input props
 */
type TCreateSlobsInputProps<
  // use props from TSlobsInputProps:
  TCustomProps,
  TValue,
  TAntProps,
  TFeatures extends keyof Partial<TAntProps> = never,
  // generate helper props:
  TGeneratedProps = Pick<TAntProps, TFeatures> & FormItemProps & IInputCommonProps<TValue>
> = Omit<TGeneratedProps, keyof TCustomProps> & TCustomProps; // join generated props with custom props

/**
 * A base hook for inputs
 * Registers input in the Form to properly handle validations
 * and returns props for Input and Wrapper components
 */
export function useInput<
  TInputProps extends TSlobsInputProps<{}, any>,
  TValue = NonNullable<TInputProps['value']>
>(type: TInputType, inputProps: TInputProps, antFeatures?: readonly string[]) {
  const { name, value, label } = inputProps;

  // save input props to Ref
  // so it will always be updated in `useCallback` calls
  const inputPropsRef = useRef(inputProps);
  inputPropsRef.current = inputProps;

  const uncontrolled = (() => {
    // inputs with debounce are always uncontrolled
    if (inputProps.debounce) return true;
    // use the value from props if provided
    if ('uncontrolled' in inputProps) return inputProps.uncontrolled;
    // the input is controlled by default
    return false;
  })();

  // get parent form if exist
  const formContext = useContext(FormContext);
  const form = formContext?.antForm;

  const inputId = useOnCreate(() => {
    // generate an unique id
    const id = `${name}-${uuid()}`;
    return id;
  });

  // create a ref for the localValue
  const localValueRef = useRef(value);
  const prevValueRef = useRef(value);

  // sync local value on props change
  if (!isEqual(value, prevValueRef.current)) {
    localValueRef.current = value;
    prevValueRef.current = value;
  }

  // set new local value
  // this function won't update the component
  function setLocalValue(newVal: TValue) {
    localValueRef.current = newVal;
  }

  useEffect(() => {
    // if the input is inside the form
    // then we need to setup it's value via Form API
    if (form) {
      // get the component class
      const Component = getInputComponentByType(type);

      if (!Component) {
        throw new Error(`Component "${type}" not found.`);
      }

      // antd components may have another format than SLOBS wrapper components
      // for example TimerInput requires dates to be in the Moment format
      // meanwhile SLOBS services works with timestamps only
      // call `Component.getAntdValue()` to make a conversion for this case
      const newVal = Component.getAntdValue ? Component.getAntdValue(value) : value;
      form.setFieldsValue({ [inputId]: newVal });
    }
  }, [value]);

  const forceUpdate = useForceUpdate();

  // create an `emitChange()` method and it's debounced version
  function emitChange(newVal: TValue) {
    if (uncontrolled) prevValueRef.current = newVal;
    inputPropsRef.current.onChange && inputPropsRef.current.onChange(newVal);
  }
  const emitChangeDebounced = useDebounce(inputProps.debounce, emitChange);
  const emitChangeThrottled = useThrottle(inputProps.throttle, emitChange);

  // create onChange handler
  const onChange = useCallback((newVal: TValue) => {
    // if nothing changed then just ignore
    if (isEqual(newVal, localValueRef.current)) return;
    const props = inputPropsRef.current;

    // call forceUpdate if component is uncontrolled
    // controlled components should be updated automatically via props changing
    if (uncontrolled) {
      localValueRef.current = newVal;
      forceUpdate();
    }

    props.onInput && props.onInput(newVal);
    if (!props.onChange) return;
    if (props.debounce) {
      emitChangeDebounced(newVal);
    } else if (props.throttle) {
      emitChangeThrottled(newVal);
    } else {
      emitChange(newVal);
    }
  }, []);

  // Create data-attributes for an Input element
  // These attributes help to find inputs in auto-tests
  const dataAttrs = {
    'data-type': type,
    'data-name': name,
    'data-title': label,
    'data-id': inputId,
  };

  // Create validation rules
  const rules = createValidationRules(type, inputProps);

  // pick props for the input wrapper
  const wrapperAttrs = {
    ...pick(inputProps, [
      'className',
      'style',
      'key',
      'label',
      'extra',
      'labelCol',
      'wrapperCol',
      'disabled',
      'readOnly',
      'nowrap',
      'layout',
      'rules',
      'tooltip',
      'hidden',
    ]),
    rules,
    'data-role': 'input-wrapper',
    name: inputId,
  };

  // sync wrapperAttrs with ref
  const wrapperAttrsRef = useRef(wrapperAttrs);
  Object.assign(wrapperAttrsRef.current, wrapperAttrs);

  // pick props for the input element
  const inputAttrs = {
    ...(pick(inputProps, 'disabled', 'readOnly', 'placeholder', 'size', antFeatures || []) as {}),
    ...dataAttrs,
    'data-role': 'input',
    name: inputId,
    value: localValueRef.current as TValue,
    onChange,
  };

  // sync inputAttrs with ref
  const inputAttrsRef = useRef(inputAttrs);
  Object.assign(inputAttrsRef.current, inputAttrs);

  return {
    inputAttrs: inputAttrsRef.current,
    wrapperAttrs: wrapperAttrsRef.current,
    dataAttrs,
    forceUpdate,
    setLocalValue,
    emitChange,
    form,
  };
}

/**
 * Hook for text fields: text, textarea, password, number
 */
export function useTextInput<
  TProps extends TSlobsInputProps<
    { uncontrolled?: boolean; onBlur?: (ev: FocusEvent<any>) => unknown },
    TValue
  >,
  TValue extends string | number = string
>(type: TInputType, p: TProps, antFeatures?: Parameters<typeof useInput>[2]) {
  // Text inputs are uncontrolled by default for better performance
  const uncontrolled = p.uncontrolled === true || p.uncontrolled !== false;
  const { inputAttrs, wrapperAttrs, forceUpdate, setLocalValue, emitChange } = useInput(
    type,
    { uncontrolled, ...p },
    antFeatures,
  );

  // we need to handle onChange differently for text inputs
  const onChange = useCallback((ev: ChangeEvent<any>) => {
    if (!uncontrolled || p.debounce) {
      // for controlled and debounced inputs call the `onChange()` handler immediately
      inputAttrs.onChange(ev.target.value);
    } else {
      // for uncontrolled text inputs just set new localValue and update the component
      setLocalValue(ev.target.value);
      forceUpdate();
    }

    // for uncontrolled inputs the `onChange()` event handles in the `onBlur()` handler
    // use the `onInput()` event if you need to handle every keypress in controlled input
  }, []);

  const onBlur = useCallback((ev: FocusEvent<any>) => {
    // for uncontrolled components call the `onChange()` handler on blur
    const newVal = type === 'number' ? Number(ev.target.value) : ev.target.value;
    if (uncontrolled && p.value !== newVal) {
      emitChange(newVal);
    }
    p.onBlur && p.onBlur(ev);
  }, []);

  const textInputAttrs = {
    ...inputAttrs,
    onChange,
    onBlur,
  };

  // sync textInputAttrs with ref
  const inputAttrsRef = useRef(textInputAttrs);
  Object.assign(inputAttrsRef.current, textInputAttrs);

  return {
    wrapperAttrs,
    inputAttrs: inputAttrsRef.current,
    originalOnChange: inputAttrs.onChange,
  };
}

/**
 * @deprecated use bindFormState instead
 * 2-way binding util for inputs
 *
 * @example
 * <pre>
 * function MyComponent() {
 *  const [myState, setMyState] = useState({name: '', email: ''});
 *  const bind = createBinding(myState, setMyState);
 * return <form>
 *     <input label="User Name" {...bind.name}>
 *     <input label="User Email" {...bind.email}>
 *   </form>
 *  }
 * </pre>
 *
 * @param stateGetter an object or function to read the field value from
 * @param stateSetter a function that changes the field given field
 * @param extraPropsGenerator a function that returns extra attributes for the input element (like disabled, placeholder,...)
 */
export function createBinding<TState extends object, TExtraProps extends object = {}>(
  stateGetter: TState | (() => TState),
  stateSetter: (newTarget: Partial<TState>) => unknown,
  extraPropsGenerator?: (fieldName: keyof TState) => TExtraProps,
) {
  return createFormBinding(stateGetter, stateSetter, extraPropsGenerator).proxy;
}

type TFormBindings<TState, TExtraProps = {}> = {
  [K in keyof TState]: {
    name: K;
    value: TState[K];
    onChange: (newVal: TState[K]) => unknown;
  };
} &
  TExtraProps;

export function bindFormState<TFormState, TExtraProps = {}>(
  getFormState: () => TFormState,
  updateFormState: (statePatch: Partial<TFormState>) => unknown,
  extraProps?: TExtraProps,
) {
  const formState = getFormState();
  const result = {} as any;
  for (const fieldName in formState) {
    result[fieldName] = {
      name: fieldName,
      value: formState[fieldName],
      onChange: (value: any) => {
        updateFormState({ [fieldName]: value } as Partial<TFormState>);
      },
    };
  }

  extraProps ?? Object.assign(result, extraProps);

  return result as TFormBindings<TFormState, TExtraProps>;
}

function createValidationRules(type: TInputType, inputProps: IInputCommonProps<unknown>) {
  const rules = inputProps.rules ? [...inputProps.rules] : [];
  if (inputProps.required) {
    rules.push({ required: true, message: $t('The field is required') });
  }
  if (type === 'text' && inputProps.max) {
    rules.push({
      max: inputProps.max,
      message: $t('This field may not be greater than %{value} characters.', {
        value: inputProps.max,
      }),
    });
  }
  return rules;
}

/**
 * Function for creating new input components
 * Use the deep comparison algorithm for the `value` prop
 */
export function InputComponent<T extends Function>(f: T): T {
  return (React.memo(f as any, (prevProps: any, newProps: any) => {
    const keys = Object.keys(newProps);
    if (keys.length !== Object.keys(prevProps).length) return false;
    for (const key of keys) {
      // use deep comparison for the `value` prop
      // because it could have an array type (For example TagsInput.value)
      if (key === 'value' && !isEqual(newProps[key], prevProps[key])) return false;

      // for other props use shallow comparison
      if (newProps[key] !== prevProps[key]) return false;
    }
    return true;
  }) as any) as T;
}

export function getInputComponentByType(
  type: TInputType,
): JSX.Element & { getAntdValue?: (value: unknown) => unknown } {
  const name = Object.keys(InputComponents).find(componentName => {
    return componentName.split('Input')[0].toLowerCase() === type;
  });
  // TODO: index
  // @ts-ignore
  return name ? InputComponents[name] : null;
}
