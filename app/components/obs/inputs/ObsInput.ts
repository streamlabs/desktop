import _ from 'lodash';
import Vue from 'vue';
import { Prop } from 'vue-property-decorator';
import * as obs from '../../../../obs-api';
import {
  isListProperty,
  isEditableListProperty,
  isNumberProperty,
  isTextProperty,
  isFontProperty,
  isPathProperty,
} from '../../../util/properties-type-guards';
import { $t } from 'services/i18n/index';

/**
 * all possible OBS properties types
 */
export declare type TObsType =
  | 'OBS_PROPERTY_BOOL'
  | 'OBS_PROPERTY_INT'
  | 'OBS_PROPERTY_LIST'
  | 'OBS_PROPERTY_PATH'
  | 'OBS_PROPERTY_FILE'
  | 'OBS_PROPERTY_EDIT_TEXT'
  | 'OBS_PROPERTY_TEXT'
  | 'OBS_PROPERTY_UINT'
  | 'OBS_PROPERTY_COLOR'
  | 'OBS_PROPERTY_DOUBLE'
  | 'OBS_PROPERTY_FLOAT'
  | 'OBS_PROPERTY_SLIDER'
  | 'OBS_PROPERTY_FONT'
  | 'OBS_PROPERTY_EDITABLE_LIST'
  | 'OBS_PROPERTY_BUTTON'
  | 'OBS_PROPERTY_BITMASK'
  | 'OBS_INPUT_RESOLUTION_LIST'
  | 'NAIR_PROPERTY_LINK_BUTTON';

/**
 * OBS values that frontend application can change
 */
export declare type TObsValue = number | string | boolean | IObsFont | TObsStringList;

/**
 * common interface for OBS objects properties
 */
export interface IObsInput<TValueType> {
  value?: TValueType;
  name: string;
  description: string;
  showDescription?: boolean;
  enabled?: boolean;
  visible?: boolean;
  masked?: boolean;
  type?: TObsType;
  category?: string;
  subCategory?: string;
}

export declare type TObsFormData = (IObsInput<TObsValue> | IObsListInput<TObsValue>)[];

export interface IObsButtonInputValue extends IObsInput<boolean> {
  url?: string;
}

export interface IObsListInput<TValue> extends IObsInput<TValue> {
  options: IObsListOption<TValue>[];
}

export interface IObsListOption<TValue> {
  description: string;
  value: TValue;
}

export interface IObsPathInputValue extends IObsInput<string> {
  filters: IElectronOpenDialogFilter[];
}

export interface IObsNumberInputValue extends IObsInput<number> {
  minVal: number;
  maxVal: number;
  stepVal: number;
}

export interface IObsSliderInputValue extends IObsNumberInputValue {
  usePercentages?: boolean;
}

export interface IObsTextInputValue extends IObsInput<string> {
  multiline: boolean;
  info: boolean;
}

export interface IObsBitmaskInput extends IObsInput<number> {
  size: number;
}

export interface IObsFont {
  face?: string;
  flags?: number;
  size?: number;
  path?: string;
}

export interface IGoogleFont {
  face: string;
  flags: number;
  path?: string;
  size?: string;
}

export type TObsStringList = { value: string }[];

export interface IObsEditableListInputValue extends IObsInput<TObsStringList> {
  defaultPath?: string;
  filters?: IElectronOpenDialogFilter[];
}

export interface IElectronOpenDialogFilter {
  name: string;
  extensions: string[];
}

function parsePathFilters(filterStr: string): IElectronOpenDialogFilter[] {
  const filters = _.compact(filterStr.split(';;'));

  // Browser source uses *.*
  if (filterStr === '*.*') {
    return [
      {
        name: 'All Files',
        extensions: ['*'],
      },
    ];
  }

  return filters.map(filter => {
    const match = filter.match(/^(.*)\((.*)\)$/);
    const desc = _.trim(match[1]);
    let types = match[2].split(' ');

    types = types.map(type => {
      return type.match(/^\*\.(.+)$/)[1];
    });

    // This is the format that electron file dialogs use
    return {
      name: desc,
      extensions: types,
    };
  });
}

/**
 * each option represent one known nodeObs issue
 */
interface IObsFetchOptions {
  disabledFields?: string[];
  valueIsObject?: boolean;
  boolIsString?: boolean;
  transformListOptions?: boolean;
  subParametersGetter?: (propName: string) => Dictionary<any>[];
  valueGetter?: (propName: string) => any;
}

export function obsValuesToInputValues(
  category: string,
  subCategory: string,
  obsProps: Dictionary<any>[],
  options: IObsFetchOptions = {},
): TObsFormData {
  const resultProps: TObsFormData = [];

  for (const obsProp of obsProps) {
    let prop = { ...obsProp } as IObsInput<TObsValue>;
    let valueObject: Dictionary<any>;
    let obsValue = obsProp.currentValue;

    if (options.valueGetter) {
      valueObject = options.valueGetter(obsProp.name);
      obsValue = valueObject;
    }

    if (options.valueIsObject) {
      obsValue = obsValue.value;
    }

    prop.category = category;
    prop.subCategory = subCategory;

    /*
      各設定項目の説明に翻訳がかかるようになっている。
      存在しない場合はOBSが返してくる説明の文言をそのまま返す。
    */
    prop.description = $t(`settings.${category}['${subCategory}']['${prop.name}'].name`, {
      fallback: prop.description,
    });
    prop.value = obsValue;
    prop.masked = !!obsProp.masked;
    prop.enabled = !!obsProp.enabled;
    prop.visible = !!obsProp.visible;

    if (options.disabledFields && options.disabledFields.includes(prop.name)) {
      prop.visible = false;
    }

    if (['OBS_PROPERTY_LIST', 'OBS_INPUT_RESOLUTION_LIST'].includes(obsProp.type)) {
      const listOptions: any[] = [];

      if (options.transformListOptions) {
        for (const listOption of obsProp.values || []) {
          const key = Object.keys(listOption)[0];
          /*
            リストから選択する項目にも翻訳がかかるようになっている。
            存在しない場合はOBSが返してくる説明の文言をそのまま返す。
          */
          listOptions.push({
            value: listOption[key],
            description: $t(
              `settings.${category}['${subCategory}']['${obsProp.name}']['${listOption[key]}']`,
              { fallback: key },
            ),
          });
        }
      }

      if (options.subParametersGetter) {
        listOptions.push(...options.subParametersGetter(prop.name));
      }

      for (const listOption of listOptions) {
        if (listOption.description === void 0) {
          listOption.description = listOption['name'];
        }
      }

      const needToSetDefaultValue = listOptions.length && prop.value === void 0;
      if (needToSetDefaultValue) prop.value = listOptions[0].value;

      (<any>prop).options = listOptions;
    } else if (obsProp.type === 'OBS_PROPERTY_BOOL') {
      prop.value = !!prop.value;
    } else if (
      ['OBS_PROPERTY_INT', 'OBS_PROPERTY_FLOAT', 'OBS_PROPERTY_DOUBLE'].includes(obsProp.type)
    ) {
      prop = {
        ...prop,
        value: Number(prop.value),
        minVal: obsProp.minVal,
        maxVal: obsProp.maxVal,
        stepVal: obsProp.stepVal,
      } as IObsNumberInputValue;

      if (obsProp.subType === 'OBS_NUMBER_SLIDER') {
        prop.type = 'OBS_PROPERTY_SLIDER';
      }
    } else if (obsProp.type === 'OBS_PROPERTY_PATH') {
      if (valueObject && valueObject.type === 'OBS_PATH_FILE') {
        prop = {
          ...prop,
          type: 'OBS_PROPERTY_FILE',
          filters: parsePathFilters(valueObject.filter),
        } as IObsPathInputValue;
      }
    } else if (obsProp.type === 'OBS_PROPERTY_FONT') {
      prop.value = valueObject;
    } else if (obsProp.type === 'OBS_PROPERTY_EDITABLE_LIST') {
      prop = {
        ...prop,
        value: valueObject,
        filters: parsePathFilters(valueObject.filter),
        defaultPath: valueObject.default_path,
      } as IObsEditableListInputValue;
    }

    resultProps.push(prop);
  }

  return resultProps;
}

/**
 * each option represent one known nodeObs issue
 */
interface IObsSaveOptions {
  boolToString?: boolean;
  intToString?: boolean;
  valueToObject?: boolean;
  valueToCurrentValue?: boolean;
}

export function inputValuesToObsValues(
  props: TObsFormData,
  options: IObsSaveOptions = {},
): Dictionary<any>[] {
  const obsProps: Dictionary<any>[] = [];

  for (const prop of props) {
    const obsProp = { ...prop } as Dictionary<any>;
    obsProps.push(obsProp);

    if (prop.type === 'OBS_PROPERTY_BOOL') {
      if (options.boolToString) obsProp.currentValue = obsProp.currentValue ? 'true' : 'false';
    } else if (prop.type === 'OBS_PROPERTY_INT') {
      if (options.intToString) obsProp.currentValue = String(obsProp.currentValue);
    }

    if (
      options.valueToObject &&
      !['OBS_PROPERTY_FONT', 'OBS_PROPERTY_EDITABLE_LIST', 'OBS_PROPERTY_BUTTON'].includes(
        prop.type,
      )
    ) {
      obsProp.value = { value: obsProp.value };
    }

    if (options.valueToCurrentValue) {
      obsProp.currentValue = obsProp.value;
    }
  }
  return obsProps;
}

export function getPropertiesFormData(obsSource: obs.ISource): TObsFormData {
  const sourceType = obsSource.id;
  const formData: TObsFormData = [];
  const obsProps = obsSource.properties;
  const obsSettings = obsSource.settings;

  if (!obsProps) return null;
  if (!obsProps.count()) return null;

  let obsProp = obsProps.first();
  do {
    let obsType: TObsType;

    switch (obsProp.type) {
      case obs.EPropertyType.Boolean:
        obsType = 'OBS_PROPERTY_BOOL';
        break;
      case obs.EPropertyType.Int:
        obsType = 'OBS_PROPERTY_INT';
        break;
      case obs.EPropertyType.Float:
        obsType = 'OBS_PROPERTY_FLOAT';
        break;
      case obs.EPropertyType.List:
        obsType = 'OBS_PROPERTY_LIST';
        break;
      case obs.EPropertyType.Text:
        obsType = 'OBS_PROPERTY_TEXT';
        break;
      case obs.EPropertyType.Color:
        obsType = 'OBS_PROPERTY_COLOR';
        break;
      case obs.EPropertyType.Font:
        obsType = 'OBS_PROPERTY_FONT';
        break;
      case obs.EPropertyType.EditableList:
        obsType = 'OBS_PROPERTY_EDITABLE_LIST';
        break;
      case obs.EPropertyType.Button:
        obsType = 'OBS_PROPERTY_BUTTON';
        break;
      case obs.EPropertyType.Path:
        switch ((obsProp as obs.IPathProperty).details.type) {
          case obs.EPathType.File:
            obsType = 'OBS_PROPERTY_FILE';
            break;
          case obs.EPathType.Directory:
            obsType = 'OBS_PROPERTY_PATH';
            break;
        }
        break;
    }

    const formItem: IObsInput<TObsValue> = {
      value: obsProp.value,
      name: obsProp.name,
      description: $t(`source-props.${sourceType}['${obsProp.name}'].name`, {
        fallback: obsProp.description,
      }),
      enabled: obsProp.enabled,
      visible: obsProp.visible,
      type: obsType,
    };

    // handle property details

    if (isListProperty(obsProp)) {
      const name = obsProp.name;
      (formItem as IObsListInput<TObsValue>).options = obsProp.details.items.map(option => {
        return {
          value: option.value,
          description: $t(`source-props.${sourceType}['${name}']['${option.value}']`, {
            fallback: option.name,
          }),
        };
      });
    }

    if (isNumberProperty(obsProp)) {
      Object.assign(formItem as IObsNumberInputValue, {
        minVal: obsProp.details.min,
        maxVal: obsProp.details.max,
        stepVal: obsProp.details.step,
      });

      if (obsProp.details.type === obs.ENumberType.Slider) {
        formItem.type = 'OBS_PROPERTY_SLIDER';
      }
    }

    if (isEditableListProperty(obsProp)) {
      Object.assign(formItem as IObsEditableListInputValue, {
        filters: parsePathFilters(obsProp.details.filter),
        defaultPath: obsProp.details.defaultPath,
      });
    }

    if (isPathProperty(obsProp)) {
      Object.assign(formItem as IObsPathInputValue, {
        filters: parsePathFilters(obsProp.details.filter),
        defaultPath: obsProp.details.defaultPath,
      });
    }

    if (isTextProperty(obsProp)) {
      Object.assign(formItem as IObsTextInputValue, {
        multiline: obsProp.details.type === obs.ETextType.Multiline,
        info: obsProp.details.type === obs.ETextType.TextInfo,
      });
    }

    if (isFontProperty(obsProp)) {
      (formItem as IObsInput<IObsFont>).value.path = obsSource.settings['custom_font'];
    }

    formData.push(formItem);
  } while ((obsProp = obsProp.next()));

  return formData;
}

export function setPropertiesFormData(obsSource: obs.ISource, form: TObsFormData) {
  const buttons: IObsInput<boolean>[] = [];
  const formInputs: IObsInput<TObsValue>[] = [];
  let properties = null;

  form.forEach(item => {
    if (item.type === 'OBS_PROPERTY_BUTTON') {
      // Value will be true if button was pressed
      if (item.value) buttons.push(item as IObsInput<boolean>);
    } else {
      formInputs.push(item);
    }
  });

  /* Don't fetch properties unless we use it. */
  if (buttons.length !== 0) properties = obsSource.properties;

  for (const button of buttons) {
    const obsButtonProp = properties.get(button.name) as obs.IButtonProperty;
    obsButtonProp.buttonClicked(obsSource);
  }

  const settings: Dictionary<any> = {};
  formInputs.forEach(property => {
    settings[property.name] = property.value;

    if (property.type === 'OBS_PROPERTY_FONT') {
      settings['custom_font'] = (property.value as IObsFont).path;
      delete settings[property.name]['path'];
    }
  });

  /* Don't update unless we need to. */
  if (formInputs.length === 0) return;

  obsSource.update(settings);

  // validate list-inputs and update properties again if some of list inputs are invalid
  const updatedFormData = getPropertiesFormData(obsSource);
  let needUpdatePropsAgain = false;
  updatedFormData.forEach(prop => {
    if (prop.type !== 'OBS_PROPERTY_LIST') return;
    const listProp = prop as IObsListInput<TObsValue>;
    if (!listProp.options.length) return;
    const optionExists = !!listProp.options.find(option => option.value === listProp.value);
    if (optionExists) return;

    needUpdatePropsAgain = true;
    listProp.value = listProp.options[0].value;
  });
  if (needUpdatePropsAgain) setPropertiesFormData(obsSource, updatedFormData);
}

export abstract class ObsInput<TValueType> extends Vue {
  @Prop()
  value: TValueType;

  @Prop()
  category: string;

  @Prop()
  subCategory: string;

  emitInput(eventData: TValueType) {
    this.$emit('input', eventData);
  }
}
