import { $t } from 'services/i18n';
import { Validator } from 'vee-validate';
import * as inputs from './inputs';

export const inputComponents = inputs;

export enum EInputType {
  bool = 'bool',
  number = 'number',
  text = 'text',
  slider = 'slider',
  color = 'color',
  list = 'list',
  textArea = 'textArea',
  fontSize = 'fontSize',
  fontFamily = 'fontFamily',
  code = 'code',
  timer = 'timer',
}

/**
 * base interface for all metadata types
 */
export interface IInputMetadata {
  required?: boolean;
  description?: string;
  type?: EInputType;
  title?: string;
  tooltip?: string;
  disabled?: boolean;
  uuid?: string;
}

export interface INumberMetadata extends IInputMetadata {
  min?: number;
  max?: number;
  placeholder?: string;
}

export interface ITimerMetadata extends INumberMetadata {
  format?: 'hms' | 'hm' | 'ms';
}

export interface IListMetadata<TValueType> extends IInputMetadata {
  options: IListOption<TValueType>[];
  allowEmpty?: boolean;
}

export interface ITextMetadata extends IInputMetadata {
  placeholder?: string;
  max?: number;
  dateFormat?: string;
  alphaNum?: boolean;
}

export interface ISliderMetadata extends IInputMetadata {
  min: number;
  max: number;
  interval?: number;
  usePercentages?: boolean;
  hasValueBox?: boolean;
}

export interface IListOption<TValue> {
  value: TValue;
  title: string;
  description?: string;
}

// a helper for creating metadata
export const metadata = {
  timer: (options: ITimerMetadata) => ({ type: EInputType.timer, ...options } as ITimerMetadata),
  bool: (options: IInputMetadata) => ({ type: EInputType.bool, ...options } as IInputMetadata),
  number: (options: INumberMetadata) =>
    ({ type: EInputType.number, ...options } as INumberMetadata),
  text: (options: ITextMetadata) => ({ type: EInputType.text, ...options } as ITextMetadata),
  list: (options: IListMetadata<string>) =>
    ({ type: EInputType.list, ...options } as IListMetadata<string>),
  color: (options: IInputMetadata) => ({ type: EInputType.color, ...options } as IInputMetadata),
  slider: (options: ISliderMetadata) =>
    ({ type: EInputType.slider, ...options } as ISliderMetadata),
  textArea: (options: ITextMetadata) =>
    ({ type: EInputType.textArea, ...options } as ITextMetadata),
  fontSize: (options: IInputMetadata) =>
    ({ type: EInputType.fontSize, ...options } as IInputMetadata),
  fontFamily: (options: IInputMetadata) =>
    ({ type: EInputType.fontFamily, ...options } as IInputMetadata),
  code: (options: IInputMetadata) => ({ type: EInputType.code, ...options } as IInputMetadata),
};

// rules https://baianat.github.io/vee-validate/guide/rules.html
const validationMessages = {
  en: {
    messages: {
      required: () => $t('common.fieldIsRequired'),
      min_value: (fieldName: string, params: number[]) =>
        $t('common.fieldMustBeLarger', { value: params[0] }),
      max_value: (fieldName: string, params: number[]) =>
        $t('common.fieldMustBeLess', { value: params[0] }),
      date_format: (fieldName: string, params: number[]) =>
        $t('common.dateFieldFormat', { format: params[0] }),
      alpha_num: () => $t('common.fieldAlphaNumeric'),
    },
  },
};

// Override and merge the dictionaries
Validator.localize(validationMessages);
