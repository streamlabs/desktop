import cloneDeep from 'lodash/cloneDeep';

/**
 * Pure input metadata types and helpers. Safe to import from services (no Vue / vee-validate).
 */

export enum EInputType {
  bool = 'bool',
  number = 'number',
  text = 'text',
  date = 'date',
  slider = 'slider',
  color = 'color',
  list = 'list',
  textArea = 'textArea',
  fontSize = 'fontSize',
  fontFamily = 'fontFamily',
  code = 'code',
  file = 'file',
  timer = 'timer',
  toggle = 'toggle',
  mediaGallery = 'mediaGallery',
  sound = 'sound',
  imageUploader = 'imageUploader',
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
  name?: string;
}

export interface INumberMetadata extends IInputMetadata {
  min?: number;
  max?: number;
  placeholder?: string;
  isInteger?: boolean;
}

export interface ITimerMetadata extends INumberMetadata {
  format?: 'hms' | 'hm' | 'ms';
}

export interface IListMetadata<TValueType, TOptionData = unknown> extends IInputMetadata {
  options: IListOption<TValueType, TOptionData>[];
  allowEmpty?: boolean;
  loading?: boolean;
  internalSearch?: boolean;
  allowCustom?: boolean;
  noResult?: string;
  placeholder?: string;
  fullWidth?: boolean;
  openDirection?: 'top' | 'bottom';
  optionsHeight?: number;
}

export interface IImagePickerMetadata<TValueType> extends IListMetadata<TValueType> {
  isIcons: boolean;
}

export interface ITextMetadata extends IInputMetadata {
  placeholder?: string;
  max?: number;
  min?: number;
  dateFormat?: string;
  alphaNum?: boolean;
  masked?: boolean;
  fullWidth?: boolean;
  blockReturn?: boolean;
  icon?: string;

  /**
   * When true will only emit on change events instead of input events
   */
  emitOnChange?: boolean;
}

export interface IDateMetadata extends IInputMetadata {
  disablePastDates?: boolean;
}

export interface IColorMetadata extends IInputMetadata {
  includeAlpha?: boolean;
  fullWidth?: boolean;
}

export interface ISliderMetadata extends IInputMetadata {
  min?: number;
  max?: number;
  interval?: number;
  usePercentages?: boolean;
  hasValueBox?: boolean;
  data?: string[];
}

export interface IListOption<TValue = string, TOptionData = undefined> {
  value: TValue;
  title: string;
  description?: string;
  icon?: string;
  options?: { label: string; value: string }[];
  data?: TOptionData;
}

export interface IMediaGalleryMetadata extends IInputMetadata {
  clearImage?: string;
  filter?: 'audio' | 'image';
}

export interface IFileMetadata extends IInputMetadata {
  filters?: Electron.FileFilter[];
  directory?: boolean;
  save?: boolean;
}

export interface ITextAreaMetadata extends IInputMetadata {
  placeholder: string;
  max: number;
  min: number;
  blockReturn: boolean;
  rows: number;
}

export interface IImageUploaderMetadata extends IInputMetadata {
  defaultUrl?: string;
  maxFileSize?: number;
}

// a helper for creating metadata for inputs
export class InputMetadata {
  timer = (options: ITimerMetadata) => ({ type: EInputType.timer, ...options } as ITimerMetadata);
  bool = (options: IInputMetadata) => ({ type: EInputType.bool, ...options } as IInputMetadata);
  number = (options: INumberMetadata) =>
    ({ type: EInputType.number, ...options } as INumberMetadata);
  text = (options: ITextMetadata) => ({ type: EInputType.text, ...options } as ITextMetadata);
  date = (options: IDateMetadata) => ({ type: EInputType.date, ...options } as IDateMetadata);
  list<TOptionData = undefined>(options: IListMetadata<string, TOptionData>) {
    return { type: EInputType.list, ...options } as IListMetadata<string, TOptionData>;
  }
  color = (options: IColorMetadata) => ({ type: EInputType.color, ...options } as IInputMetadata);
  slider = (options: ISliderMetadata) =>
    ({ type: EInputType.slider, ...options } as ISliderMetadata);
  textArea = (options: ITextMetadata) =>
    ({ type: EInputType.textArea, ...options } as ITextMetadata);
  fontSize = (options: INumberMetadata) =>
    ({ type: EInputType.fontSize, ...options } as INumberMetadata);
  fontFamily = (options: IInputMetadata) =>
    ({ type: EInputType.fontFamily, ...options } as IInputMetadata);
  code = (options: IInputMetadata) => ({ type: EInputType.code, ...options } as IInputMetadata);
  file = (options: IFileMetadata) => ({ type: EInputType.file, ...options } as IFileMetadata);
  toggle = (options: IInputMetadata) => ({ type: EInputType.toggle, ...options } as IInputMetadata);
  mediaGallery = (options: IMediaGalleryMetadata) =>
    ({ type: EInputType.mediaGallery, ...options } as IMediaGalleryMetadata);
  sound = (options: IMediaGalleryMetadata) =>
    ({ type: EInputType.sound, ...options } as IMediaGalleryMetadata);
  imageUploader = (options: IImageUploaderMetadata) =>
    ({ type: EInputType.imageUploader, ...options } as IImageUploaderMetadata);
}
export const metadata = new InputMetadata();

// a helper for creating metadata for forms
export function formMetadata<TMetadataType extends Dictionary<IInputMetadata>>(
  inputsMetadata: TMetadataType,
): TMetadataType {
  // setup object key as a name property
  const formMetadata = cloneDeep(inputsMetadata);
  Object.keys(inputsMetadata).forEach(key => {
    if (formMetadata[key]['name']) return;
    formMetadata[key]['name'] = key;
  });

  return formMetadata;
}
