import { Select, Row, Col } from 'antd';
import React, { ReactNode, useRef } from 'react';
import { InputComponent, TSlobsInputProps, useInput, ValuesOf } from './inputs';
import InputWrapper from './InputWrapper';
import { RefSelectProps, SelectProps } from 'antd/lib/select';
import { useDebounce } from '../../hooks';
import omit from 'lodash/omit';
import { getDefined } from '../../../util/properties-type-guards';
import { findDOMNode } from 'react-dom';

// select what features from the antd lib we are going to use
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
] as const;

// define custom props
export interface ICustomListProps<TValue> {
  hasImage?: boolean;
  imageSize?: { width: number; height: number };
  optionRender?: (opt: IListOption<TValue>) => ReactNode;
  labelRender?: (opt: IListOption<TValue>) => ReactNode;
  onBeforeSearch?: (searchStr: string) => unknown;
  options?: IListOption<TValue>[];
  description?: string;
}

// define a type for the component's props
export type TListInputProps<TValue> = TSlobsInputProps<
  ICustomListProps<TValue>,
  TValue,
  SelectProps<string>,
  ValuesOf<typeof ANT_SELECT_FEATURES>
>;

/**
 * data for a single option
 */
export interface IListOption<TValue> {
  label: string;
  /** The untranslated original label */
  originalLabel?: string;
  value: TValue;
  description?: string;
  image?: string | ReactNode;
}

export const ListInput = InputComponent(<T extends any>(p: TListInputProps<T>) => {
  const { inputAttrs, wrapperAttrs, form } = useInput('list', p, ANT_SELECT_FEATURES);

  // TODO: allow to use this component outside a Form
  if (!form) console.error('ListInput component should be wrapped in Form');

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
    // stick the selector popup to the closest Scrollable content
    const $el: Element = getDefined(findDOMNode($inputRef.current));
    return $el.closest('.os-content, body')! as HTMLElement;
  }

  const selectedOption = options?.find(opt => opt.value === p.value);

  return (
    <InputWrapper {...wrapperAttrs} extra={p?.description ?? selectedOption?.description}>
      <Select
        ref={$inputRef}
        {...omit(inputAttrs, 'onChange')}
        // search by label instead value
        value={inputAttrs.value as string}
        optionFilterProp="label"
        optionLabelProp="labelrender"
        onSearch={p.showSearch ? onSearchHandler : undefined}
        onChange={val => p.onChange && p.onChange(val as T)}
        onSelect={p.onSelect}
        defaultValue={p.defaultValue as string}
        getPopupContainer={getPopupContainer}
        data-value={inputAttrs.value}
        data-selected-option-label={selectedOption?.label}
        data-show-search={
          // TODO: index
          // @ts-ignore
          !!inputAttrs['showSearch']
        }
        data-loading={
          // TODO: index
          // @ts-ignore
          !!inputAttrs['loading']
        }
      >
        {options && options.map((opt, ind) => renderOption(opt, ind, p))}
      </Select>
    </InputWrapper>
  );
});

export function renderOption<T>(
  opt: IListOption<T>,
  ind: number,
  inputProps: ICustomListProps<T> & { name?: string },
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

function renderOptionWithImage<T>(opt: IListOption<T>, inputProps: ICustomListProps<T>) {
  const src = opt.image;
  const { width, height } = inputProps.imageSize ? inputProps.imageSize : { width: 15, height: 15 };
  const imageStyle = {
    width: `${width}px`,
    height: `${height}px`,
  };
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
  const imageStyle = {
    width: `${width}px`,
    height: `${height}px`,
  };
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
