import { Rule } from 'antd/lib/form';
import { TInputValue } from './FormFactory';
import { IListOption } from './ListInput';

/**
 * Metadata generator for inputs
 * Provides some presets and helps with typechecking
 */
export const metadata = {
  any: (options: IAnyMetadata) => options,
  text: (options: ITextMetadata) => ({ ...options, type: 'text' }),
  textarea: (options: ITextMetadata) => ({ ...options, type: 'textarea' }),
  number: (options: INumberMetadata) => ({ ...options, type: 'number' }),
  slider: (options: ISliderMetadata) => ({ ...options, type: 'slider' }),
  bool: (options: ITextBoolMetadata) => ({ ...options, type: 'checkbox' }),
  switch: (options: ITextBoolMetadata) => ({ ...options, type: 'switch' }),
  list: <T>(options: IListMetadata<T>) => ({ ...options, type: 'list' }),
  color: (options: IBaseMetadata) => ({ ...options, type: 'color' }),
  fontSize: (options: ISliderMetadata) => ({
    min: 8,
    max: 80,
    step: 1,
    ...options,
    type: 'slider',
  }),
  autocomplete: <T>(options: IListMetadata<T>) => ({
    ...options,
    type: 'autocomplete',
  }),
  seconds: (options: ISliderMetadata) => ({
    min: 0,
    step: 1000,
    tipFormatter: (ms: number) => `${ms / 1000}s`,
    ...options,
    type: 'slider',
  }),
};

export type TInputMetadata<T = string> =
  | ITextMetadata
  | INumberMetadata
  | ISliderMetadata
  | ITextBoolMetadata
  | ICheckboxGroupMetadata
  | IListMetadata<T>;

interface IBaseMetadata {
  label?: string;
  tooltip?: string;
  required?: boolean;
  type?: string;
  rules?: Rule[];
  onChange?: (value: unknown) => void;
  children?: Dictionary<TInputMetadata<unknown>>;
  displayed?: boolean;
  disabled?: boolean;
  name?: string;
}

interface ITextMetadata extends IBaseMetadata {
  value?: string;
  isPassword?: boolean;
}

export interface ICheckboxGroupMetadata extends IBaseMetadata {
  children: Dictionary<ITextBoolMetadata>;
  values: Dictionary<TInputValue>;
  onChange: (key: string) => (value: boolean) => void;
}

interface INumberMetadata extends IBaseMetadata {
  value?: number;
  min?: number;
  max?: number;
}

interface ISliderMetadata extends IBaseMetadata {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  tipFormatter?: (val: number) => string;
}

interface ITextBoolMetadata extends IBaseMetadata {
  value?: boolean;
}

interface IAnyMetadata extends IBaseMetadata {
  value?: any;
}

export interface IListMetadata<T = string> extends IBaseMetadata {
  value?: T;
  options?: IListOption<T>[];
}
