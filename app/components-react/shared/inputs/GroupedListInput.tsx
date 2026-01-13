import { Select, Row, Col } from 'antd';
import React, { ReactNode, useRef, useMemo } from 'react';
import { InputComponent, TSlobsInputProps, useInput, ValuesOf } from './inputs';
import InputWrapper from './InputWrapper';
import { RefSelectProps, SelectProps } from 'antd/lib/select';
import { useDebounce } from '../../hooks';
import omit from 'lodash/omit';
import { getDefined } from '../../../util/properties-type-guards';
import { findDOMNode } from 'react-dom';

const ANT_SELECT_FEATURES = [
  'showSearch',
  'loading',
  'placeholder',
  'notFoundContent',
  'onDropdownVisibleChange',
  'onSearch',
  'onSelect',
  'allowClear',
  'defaultActiveFirstOption',
  'listHeight',
  'filterOption',
  'suffixIcon',
  'size',
  'dropdownMatchSelectWidth',
] as const;

/** Data for a single option */
export interface IListOption<TValue> {
  label: string;
  originalLabel?: string;
  value: TValue;
  description?: string;
  image?: string | ReactNode;
}

/** Data for a Group of options */
export interface IListGroup<TValue> {
  label: string;
  options: IListOption<TValue>[];
}

export interface IGroupedListProps<TValue> {
  hasImage?: boolean;
  imageSize?: { width: number; height: number };
  optionRender?: (opt: IListOption<TValue>) => ReactNode;
  labelRender?: (opt: IListOption<TValue>) => ReactNode;
  onBeforeSearch?: (searchStr: string) => unknown;
  // STRICTLY enforce Groups here
  options?: IListGroup<TValue>[]; 
  description?: string;
  nolabel?: boolean;
  filter?: string;
}

export type TGroupedListInputProps<TValue> = TSlobsInputProps<
  IGroupedListProps<TValue>,
  TValue,
  SelectProps<string>,
  ValuesOf<typeof ANT_SELECT_FEATURES>
>;

export const GroupedListInput = InputComponent(<T extends any>(p: TGroupedListInputProps<T>) => {
  const { inputAttrs, wrapperAttrs, form } = useInput('list', p, ANT_SELECT_FEATURES);

  if (!form) console.error('GroupedListInput component should be wrapped in Form');

  const options = p.options;
  const debouncedSearch = useDebounce(p.debounce, startSearch);
  const $inputRef = useRef<RefSelectProps>(null);

  function startSearch(searchStr: string) {
    p.onSearch && p.onSearch(searchStr);
  }

  function onSearchHandler(searchStr: string) {
    p.onBeforeSearch && p.onBeforeSearch(searchStr);
    if (!p.onSearch) return;
    if (p.debounce) {
      debouncedSearch(searchStr);
    } else {
      startSearch(searchStr);
    }
  }

  function getPopupContainer() {
    const $el: Element = getDefined(findDOMNode($inputRef.current));
    return $el.closest('.os-content, body')! as HTMLElement;
  }

  const selectedOption = useMemo(() => {
    if (!options) return undefined;
    for (const group of options) {
      const found = group.options.find((opt) => opt.value === p.value);
      if (found) return found;
    }
    return undefined;
  }, [options, p.value]);

  return (
    <InputWrapper
      {...wrapperAttrs}
      extra={p?.description ?? selectedOption?.description}
      nolabel={p?.nolabel}
    >
      <Select
        ref={$inputRef}
        {...omit(inputAttrs, 'onChange')}
        value={inputAttrs.value as string}
        optionFilterProp="label"
        optionLabelProp="labelrender"
        onSearch={p.showSearch ? onSearchHandler : undefined}
        onChange={(val) => p.onChange && p.onChange(val as T)}
        onSelect={p.onSelect}
        defaultValue={p.defaultValue as string}
        getPopupContainer={getPopupContainer}
        data-value={inputAttrs.value}
        data-selected-option-label={selectedOption?.label}
        data-show-search={!!p.showSearch}
        data-loading={!!p.loading}
        dropdownMatchSelectWidth={p.dropdownMatchSelectWidth}
      >
        {options &&
          options.map((group) => (
            <Select.OptGroup key={group.label} label={group.label}>
              {group.options.map((opt, ind) =>
                renderOption(opt, ind, p)
              )}
            </Select.OptGroup>
          ))}
      </Select>
    </InputWrapper>
  );
});

function renderOption<T>(
  opt: IListOption<T>,
  ind: number,
  inputProps: IGroupedListProps<T> & { name?: string }
) {
  const attrs = {
    'data-option-list': inputProps.name,
    'data-option-label': opt.originalLabel ?? opt.label,
    'data-option-value': opt.value,
    label: opt.label,
    value: (opt.value as unknown) as string,
    key: `${ind}-${opt.value}`,
  };

  const labelEl = (() => {
    if (inputProps.labelRender) {
      return inputProps.labelRender(opt);
    } else if (inputProps.hasImage) {
      return renderLabelWithImage(opt);
    } else {
      return opt.label;
    }
  })();

  const children = (() => {
    if (inputProps.optionRender) {
      return inputProps.optionRender(opt);
    } else if (inputProps.hasImage) {
      return renderOptionWithImage(opt, inputProps);
    } else {
      return opt.label;
    }
  })();

  return (
    <Select.Option {...attrs} labelrender={labelEl}>
      {children}
    </Select.Option>
  );
}

function renderOptionWithImage<T>(opt: IListOption<T>, inputProps: IGroupedListProps<T>) {
  const src = opt.image;
  const { width, height } = inputProps.imageSize ? inputProps.imageSize : { width: 15, height: 15 };
  const imageStyle = { width: `${width}px`, height: `${height}px` };

  return (
    <Row gutter={8} align="middle" wrap={false}>
      <Col>
        {src &&
          (typeof src === 'string' ? (
            <img src={src} alt="" style={imageStyle} />
          ) : (
            <div>{src}</div>
          ))}
        {!src && <div style={imageStyle} />}
      </Col>
      <Col>{opt.label}</Col>
    </Row>
  );
}

function renderLabelWithImage<T>(opt: IListOption<T>) {
  const src = opt.image;
  const [width, height] = [15, 15];
  const imageStyle = { width: `${width}px`, height: `${height}px` };

  return (
    <Row gutter={8}>
      <Col>
        {src &&
          (typeof src === 'string' ? (
            <img src={src} alt="" style={imageStyle} />
          ) : (
            <div>{src}</div>
          ))}
        {!src && <div style={imageStyle} />}
      </Col>
      <Col>{opt.label}</Col>
    </Row>
  );
}