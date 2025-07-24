import React, { LegacyRef, RefObject, forwardRef, useMemo, useRef, useState } from 'react';
import { ISettingsSubCategory } from '../../services/settings';
import {
  IObsInput,
  IObsListInput,
  TObsFormData,
  TObsValue,
  IObsPathInputValue,
  IObsSliderInputValue,
  IObsTextInputValue,
  IObsNumberInputValue,
  IObsBitmaskInput,
  IObsListOption,
} from '../../components/obs/inputs/ObsInput';
import Form, { useFormContext } from '../shared/inputs/Form';
import {
  CheckboxInput,
  ColorInput,
  FileInput,
  ListInput,
  SliderInput,
  TextAreaInput,
  TInputLayout,
  useTextInput,
} from '../shared/inputs';
import { IObsFormType } from '../windows/settings/ObsSettings';
import { showFileDialog } from '../shared/inputs/FileInput';
import cloneDeep from 'lodash/cloneDeep';
import { Button, Collapse, Input, InputNumber } from 'antd';
import InputWrapper from '../shared/inputs/InputWrapper';
import { $t, $translateIfExist, $translateIfExistWithCheck } from '../../services/i18n';
import Utils from 'services/utils';
import cx from 'classnames';
import * as obs from '../../../obs-api';
import Tabs from 'components-react/shared/Tabs';
import { ANT_NUMBER_FEATURES, TNumberInputProps } from 'components-react/shared/inputs/NumberInput';
import { ANT_INPUT_FEATURES, TTextInputProps } from 'components-react/shared/inputs/TextInput';
interface IExtraInputProps {
  debounce?: number;
}

export interface IObsFormProps {
  value: IObsInput<TObsValue>[];
  onChange: (newValue: IObsInput<TObsValue>[], changedInd: number) => unknown;
  layout?: TInputLayout;
  style?: React.CSSProperties;
  extraProps?: Record<string, IExtraInputProps>;
  name?: string;
}

/**
 * Renders a form with OBS inputs
 */
export function ObsForm(p: IObsFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function onInputHandler(value: IObsInput<TObsValue>, index: number) {
    const newValue = cloneDeep(p.value);
    newValue.splice(index, 1, value);

    p.onChange(newValue, index);
  }

  const name = p?.name || p.value[0]?.name;

  return (
    <Form layout={p.layout || 'vertical'} style={p.style} name={name}>
      {p.value.map((inputData, inputIndex) => (
        <ObsInput
          ref={inputRef}
          value={inputData}
          key={inputData.name}
          inputIndex={inputIndex}
          onChange={onInputHandler}
          extraProps={p.extraProps?.[inputData.name]}
        />
      ))}
    </Form>
  );
}

interface IObsInputProps {
  value: IObsInput<TObsValue>;
  inputIndex: number;
  onChange: (newValue: IObsInput<TObsValue>, inputInd: number) => unknown;
  extraProps?: IExtraInputProps;
}

/**
 * Renders a single OBS input
 */
const ObsInput = forwardRef<{}, IObsInputProps>((p, ref) => {
  const formContext = useFormContext();
  const layout = formContext?.layout;
  if (!p.value.visible) return <></>;
  const type = p.value.type;

  function onChangeHandler(...args: any[]) {
    const newVal = cloneDeep(p.value);
    newVal.value = args[0] as TObsValue;
    p.onChange(newVal, p.inputIndex);
  }

  const extraProps = p.extraProps || {};

  const inputProps = {
    value: p.value.value as any,
    onChange: onChangeHandler,
    name: p.value.name,
    label: $translateIfExist(p.value.description),
    uncontrolled: false,
    masked: p.value.masked,
    disabled: !p.value.enabled,
    ...extraProps,
  };

  switch (type) {
    case 'OBS_PROPERTY_DOUBLE':
      return <ObsNumberInput {...inputProps} ref={ref} data-name={p.value.name} />;
    case 'OBS_PROPERTY_INT':
      // eslint-disable-next-line no-case-declarations
      const intVal = p.value as IObsNumberInputValue;

      return (
        <ObsNumberInput
          {...inputProps}
          step={1}
          min={intVal.minVal}
          max={intVal.maxVal}
          ref={ref}
          data-name={p.value.name}
        />
      );
    case 'OBS_PROPERTY_EDIT_TEXT':
    case 'OBS_PROPERTY_TEXT':
      // eslint-disable-next-line no-case-declarations
      const textVal = p.value as IObsTextInputValue;

      if (textVal.multiline) {
        return <TextAreaInput {...inputProps} debounce={300} data-name={p.value.name} />;
      } else if (textVal.infoField) {
        const infoField = (textVal.infoField as unknown) as obs.ETextInfoType;
        switch (textVal.infoField) {
          case infoField === obs.ETextInfoType.Warning:
            return (
              <InputWrapper style={{ color: 'var(--info)' }} data-name={p.value.name}>
                {textVal.description}
              </InputWrapper>
            );
          case infoField === obs.ETextInfoType.Error:
            return (
              <InputWrapper style={{ color: 'var(--warning)' }} data-name={p.value.name}>
                {textVal.description}
              </InputWrapper>
            );
          default:
            return <InputWrapper data-name={p.value.name}>{textVal.description}</InputWrapper>;
        }
      } else {
        return (
          <ObsTextInput
            {...inputProps}
            isPassword={inputProps.masked}
            ref={ref}
            data-name={p.value.name}
          />
        );
      }
    case 'OBS_PROPERTY_LIST':
      // eslint-disable-next-line no-case-declarations
      const options = (p.value as IObsListInput<unknown>).options.map(opt => {
        // treat 0 as an non-selected option if the description is empty
        if (opt.value === 0 && opt.description === '') {
          return { label: $t('Select Option'), value: 0 };
        }

        return {
          value: opt.value,
          label: $translateIfExistWithCheck(opt.description),
          originalLabel: opt.description,
        };
      });

      return (
        <ListInput
          {...inputProps}
          options={options}
          allowClear={false}
          nolabel={p.value.description === ''}
          style={{
            marginBottom: (p.value as IObsListInput<unknown>)?.subType === '' ? '8px' : '24px',
          }}
          data-name={p.value.name}
        />
      );

    case 'OBS_INPUT_RESOLUTION_LIST':
      // eslint-disable-next-line no-case-declarations
      const resolutions: Omit<
        IObsListOption<unknown>,
        'description'
      >[] = (p.value as IObsListInput<number>).options.map(opt => {
        // treat 0 as an non-selected option if the description is empty
        if (opt.value === 0 && opt.description === '') {
          return { label: $t('Select Option'), value: 0 };
        }

        return {
          value: opt.value,
          label: $translateIfExistWithCheck(opt?.description),
          originalLabel: opt?.description,
        };
      });

      return (
        <ObsInputListCustomResolutionInput
          inputProps={inputProps}
          options={resolutions}
          data-name={p.value.name}
        />
      );

    case 'OBS_PROPERTY_BUTTON':
      return (
        <InputWrapper>
          <Button onClick={() => inputProps.onChange(true)} data-name={p.value.name}>
            {inputProps.label}
          </Button>
        </InputWrapper>
      );

    case 'OBS_PROPERTY_BOOL':
      return (
        <InputWrapper style={{ marginBottom: '8px' }} nowrap={layout === 'vertical'}>
          <CheckboxInput {...inputProps} data-name={p.value.name} />
        </InputWrapper>
      );

    case 'OBS_PROPERTY_FILE':
      return <FileInput {...inputProps} filters={(p.value as IObsPathInputValue).filters} />;

    case 'OBS_PROPERTY_COLOR':
      // eslint-disable-next-line no-case-declarations
      const rgba = Utils.intToRgba(p.value.value as number);
      rgba.a = rgba.a / 255;

      return (
        <ColorInput
          {...inputProps}
          value={rgba}
          onChange={(v: any) => {
            inputProps.onChange(Utils.rgbaToInt(v.r, v.g, v.b, Math.round(v.a * 255)));
          }}
          data-name={p.value.name}
        />
      );

    case 'OBS_PROPERTY_SLIDER':
      // eslint-disable-next-line no-case-declarations
      const sliderVal = p.value as IObsSliderInputValue;

      // TODO: usePercentages is not hooked up yet
      return (
        <SliderInput
          {...inputProps}
          step={sliderVal.stepVal}
          min={sliderVal.minVal}
          max={sliderVal.maxVal}
          hasNumberInput={true}
          debounce={500}
          tooltipPlacement="right"
          data-name={p.value.name}
        />
      );

    case 'OBS_PROPERTY_BITMASK':
      // eslint-disable-next-line no-case-declarations
      const flagsVal = p.value as IObsBitmaskInput;
      // eslint-disable-next-line no-case-declarations
      const flags = Utils.numberToBinnaryArray(flagsVal.value, flagsVal.size).reverse();

      return (
        <InputWrapper label={flagsVal.description} data-name={p.value.name}>
          {flags.map((flag, index) => (
            <Button
              key={`flag-${index}`}
              onClick={() => {
                const newFlags = Array(flagsVal.size).fill(0);
                newFlags.splice(index, 1, 1);
                inputProps.onChange(Utils.binnaryArrayToNumber(newFlags.reverse()));
              }}
              style={{
                marginRight: '5px',
                backgroundColor: flag === 1 ? 'var(--primary)' : 'var(--dark-background)',
                color: flag === 1 ? 'var(--action-button-text)' : 'var(--icon)',
                borderColor: flag === 1 ? 'var(--primary)' : 'var(--icon)',
                padding: '10px',
                lineHeight: 0.75,
              }}
            >
              {index}
            </Button>
          ))}
        </InputWrapper>
      );

    case 'OBS_PROPERTY_PATH':
      return (
        <ObsTextInput
          {...inputProps}
          style={{ marginBottom: '8px' }}
          addonAfter={
            <Button onClick={() => showFileDialog({ ...inputProps, directory: true })}>
              {$t('Browse')}
            </Button>
          }
        />
      );

    case 'OBS_PROPERTY_UINT':
      // eslint-disable-next-line no-case-declarations
      const uintVal = p.value as IObsNumberInputValue;

      return (
        <ObsNumberInput
          {...inputProps}
          step={1}
          min={uintVal.minVal}
          max={uintVal.maxVal}
          ref={ref}
          data-name={p.value.name}
        />
      );

    default:
      return <span style={{ color: 'red' }}>Unknown input type {type}</span>;
  }
});

interface IObsFormGroupProps {
  categoryName?: string;
  value: ISettingsSubCategory[];
  onChange: (newValue: ISettingsSubCategory[]) => unknown;
  type?: IObsFormType;
}

/**
 * Renders a group of OBS forms
 */
export function ObsFormGroup(p: IObsFormGroupProps) {
  function onChangeHandler(formData: TObsFormData, ind: number) {
    const newVal = cloneDeep(p.value);
    newVal[ind].parameters = formData;
    p.onChange(newVal);
  }
  const sections = p.value.filter(section => section.parameters.filter(p => p.visible).length);

  const type = p.type || 'default';

  return (
    <div className="form-groups" style={{ paddingBottom: '12px' }}>
      {type === 'default' &&
        sections.map((sectionProps, ind) => (
          <div className="section" key={`${sectionProps.nameSubCategory}${ind}`}>
            {sectionProps.nameSubCategory !== 'Untitled' && (
              <h2 className="section-title">{$t(sectionProps.nameSubCategory)}</h2>
            )}
            <div className="section-content">
              <ObsForm
                value={sectionProps.parameters}
                onChange={formData => onChangeHandler(formData, ind)}
              />
            </div>
          </div>
        ))}

      {type === 'tabs' && <ObsTabbedFormGroup sections={sections} onChange={onChangeHandler} />}

      {type === 'collapsible' && (
        <ObsCollapsibleFormGroup sections={sections} onChange={onChangeHandler} />
      )}
    </div>
  );
}

export interface IObsSectionedFormGroupProps {
  sections: ISettingsSubCategory[];
  onChange: (formData: TObsFormData, ind: number) => unknown;
}

export function ObsCollapsibleFormGroup(p: IObsSectionedFormGroupProps) {
  return (
    <>
      {p.sections.map((sectionProps, ind) => (
        <div
          className="section"
          key={`${sectionProps.nameSubCategory}${ind}`}
          style={{ padding: sectionProps.nameSubCategory !== 'Untitled' ? '4px' : '16px' }}
        >
          {sectionProps.nameSubCategory === 'Untitled' ? (
            <div className="section-content">
              <ObsForm
                value={sectionProps.parameters}
                onChange={formData => p.onChange(formData, ind)}
              />
            </div>
          ) : (
            <ObsCollapsibleFormItem
              key={`${sectionProps.nameSubCategory}${ind}`}
              name={sectionProps.nameSubCategory}
              section={sectionProps}
              onChange={formData => p.onChange(formData, ind)}
            />
          )}
        </div>
      ))}
    </>
  );
}

/**
 * Renders the obs form within tabs
 * @remark - The tab names are passed in from the parent component because the names of the tabs
 * may not be the same as the names of the sections.
 */
export function ObsTabbedFormGroup(p: IObsSectionedFormGroupProps) {
  const tabs = p.sections.map(sectionProps => sectionProps.nameSubCategory);
  const [currentTab, setCurrentTab] = useState(p.sections[1].nameSubCategory);

  return (
    <div className="section" key="tabbed-section" style={{ marginBottom: '24px' }}>
      {p.sections.map((sectionProps, ind) => (
        <div className="section-content" key={`${sectionProps.nameSubCategory}${ind}`}>
          {sectionProps.nameSubCategory === 'Untitled' && (
            <>
              <ObsForm
                value={sectionProps.parameters}
                onChange={formData => p.onChange(formData, ind)}
              />
              <Tabs tabs={tabs} onChange={setCurrentTab} style={{ marginBottom: '24px' }} />
            </>
          )}

          {sectionProps.nameSubCategory === currentTab && (
            <ObsForm
              name={sectionProps.nameSubCategory}
              value={sectionProps.parameters}
              onChange={formData => p.onChange(formData, ind)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

interface IObsCollapsibleFormItemProps {
  section: ISettingsSubCategory;
  name: string;
  onChange: (formData: TObsFormData, ind: number) => unknown;
}

const { Panel } = Collapse;

export function ObsCollapsibleFormItem(p: IObsCollapsibleFormItemProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Collapse
      className={cx('section-content', 'section-content--collapse')}
      onChange={() => setExpanded(!expanded)}
      defaultActiveKey={[`${p.section.nameSubCategory}`]}
      expandIcon={({ isActive }) => (
        <i
          className={cx('fa', 'section-title__icon', {
            'fa-minus': isActive,
            'fa-plus': !isActive,
          })}
        />
      )}
      bordered={false}
    >
      <Panel
        className="section-content--panel"
        header={p.section.nameSubCategory}
        key={`${p.section.nameSubCategory}`}
      >
        <ObsForm name={p.name} value={p.section.parameters} onChange={p.onChange} />
      </Panel>
    </Collapse>
  );
}

interface IObsInputListCustomResolutionInputProps {
  inputProps: any;
  options?: Omit<IObsListOption<unknown>, 'description'>[];
}

const ObsInputListCustomResolutionInput = forwardRef<{}, IObsInputListCustomResolutionInputProps>(
  (p, ref) => {
    const [custom, setCustom] = useState(false);
    const [customResolution, setCustomResolution] = useState(p.inputProps.value);

    const formContext = useFormContext();

    function onChange(val: string) {
      formContext?.antForm.validateFields();
      setCustomResolution(val);

      if (custom && /^[0-9]+x[0-9]+$/.test(customResolution)) {
        p.inputProps.onChange(customResolution);
      }
    }

    function onClick() {
      formContext?.antForm.validateFields();
      const isValid = /^[0-9]+x[0-9]+$/.test(customResolution);
      if (custom && !isValid) return;

      if (custom && isValid) {
        p.inputProps.onChange(customResolution);
        setCustomResolution('');
      }

      setCustom(!custom);
    }

    return (
      <>
        {custom ? (
          <ObsTextInput
            {...p.inputProps}
            value={customResolution}
            onChange={val => onChange(val)}
            label={p.inputProps.label}
            validateTrigger="onBlur"
            rules={[
              {
                message: $t(
                  'The resolution must be in the format [width]x[height] (i.e. 1920x1080)',
                ),
                pattern: /^[0-9]+x[0-9]+$/,
              },
            ]}
            uncontrolled={false}
            name={p.inputProps.name}
            ref={ref}
          />
        ) : (
          <ListInput {...p.inputProps} allowClear={false} options={p.options} />
        )}

        <Button
          type={custom ? 'primary' : 'default'}
          onClick={onClick}
          style={{ marginBottom: '24px' }}
        >
          {custom ? $t('Apply Primary') : $t('Use Custom')}
        </Button>
      </>
    );
  },
);

/**
 * @remark Note: The following is a copy of the shared component `NumberInput` but with the reference forwarded.
 * This is to allow form validation to work correctly.
 */
const ObsNumberInput = forwardRef((p: TNumberInputProps, ref) => {
  const { inputAttrs, wrapperAttrs, originalOnChange } = useTextInput<typeof p, number>(
    'number',
    p,
    ANT_NUMBER_FEATURES,
  );

  function onChangeHandler(val: number | string) {
    // don't emit onChange if the value is out of range
    if (typeof val !== 'number') return;
    if (typeof p.max === 'number' && val > p.max) return;
    if (typeof p.min === 'number' && val < p.min) return;
    originalOnChange(val);
  }

  const rules = p.rules ? p.rules[0] : {};

  return (
    <InputWrapper
      {...wrapperAttrs}
      rules={[{ ...rules, type: 'number' }]}
      style={{ width: '100%' }}
    >
      <InputNumber
        {...inputAttrs}
        onChange={onChangeHandler}
        defaultValue={p.defaultValue}
        ref={ref as RefObject<HTMLInputElement>}
        style={{ width: '100%' }}
      />
    </InputWrapper>
  );
});

/**
 * @remark Note: The following is a copy of the shared component `TextInput` but with the reference forwarded.
 * This is to allow form validation to work correctly.
 */
const ObsTextInput = forwardRef<{}, TTextInputProps>((p, ref) => {
  const { inputAttrs, wrapperAttrs } = useTextInput('text', p, ANT_INPUT_FEATURES);
  const textInputAttrs = {
    ...inputAttrs,
    onFocus: p.onFocus,
    onKeyDown: p.onKeyDown,
    onMouseDown: p.onMouseDown,
    ref: p.inputRef,
    prefix: p.prefix,
  };
  return (
    <InputWrapper {...wrapperAttrs} style={{ width: '100%' }}>
      <Input {...textInputAttrs} ref={ref as LegacyRef<Input>} />
    </InputWrapper>
  );
});
