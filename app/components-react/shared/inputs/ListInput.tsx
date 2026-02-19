import { Select, Row, Col } from 'antd';
import React, { ReactNode, useRef, useMemo } from 'react';
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
  'suffixIcon',
  'size',
  'dropdownMatchSelectWidth',
] as const;

export interface IListGroup<TValue> {
  label: string;
  options: IListOption<TValue>[];
}

// define custom props
export interface ICustomListProps<TValue> {
  hasImage?: boolean;
  imageSize?: { width: number; height: number };
  optionRender?: (opt: IListOption<TValue>) => ReactNode;
  labelRender?: (opt: IListOption<TValue>) => ReactNode;
  onBeforeSearch?: (searchStr: string) => unknown;
  options?: IListOption<TValue>[] | IListGroup<TValue>[];
  description?: string;
  nolabel?: boolean;
  filter?: string;
}

/**
 * enable options to be either a flat list or grouped list
 */
type TListInputInternalProps<TValue> = TSlobsInputProps<
  ICustomListProps<TValue>,
  TValue,
  SelectProps<string>,
  ValuesOf<typeof ANT_SELECT_FEATURES>
>;

export type TListInputProps<TValue> = Omit<TListInputInternalProps<TValue>, 'options'> & {
  options?: IListOption<TValue>[];
};

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

// checks if data is a list of Groups
function isGroupList<T>(data: any[]): data is IListGroup<T>[] {
  return data.length > 0 && 'options' in data[0] && Array.isArray(data[0].options);
}

export const ListInput = InputComponent(<T extends any>(p: TListInputInternalProps<T>) => {
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

  const hasGroups = useMemo(() => {
    return options && isGroupList<T>(options);
  }, [options]);

  const selectedOption = useMemo(() => {
    if (!options || options.length === 0) return undefined;

    if (hasGroups) {
      const groups = options as IListGroup<T>[];
      for (const group of groups) {
        const found = group.options.find(opt => opt.value === p.value);
        if (found) return found;
      }
    } else {
      const flatOptions = options as IListOption<T>[];
      return flatOptions.find(opt => opt.value === p.value);
    }
    return undefined;
  }, [options, hasGroups, p.value]);

  return (
    <InputWrapper
      {...wrapperAttrs}
      extra={p?.description ?? selectedOption?.description}
      nolabel={p?.nolabel}
    >
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
        dropdownMatchSelectWidth={p.dropdownMatchSelectWidth}
      >
        {/* render groups */}
        {hasGroups &&
          (options as IListGroup<T>[]).map(group => (
            <Select.OptGroup key={group.label} label={group.label}>
              {group.options.map((opt, ind) => renderOption(opt, ind, p))}
            </Select.OptGroup>
          ))}

        {/* render flat options */}
        {!hasGroups &&
          options &&
          (options as IListOption<T>[]).map((opt, ind) => renderOption(opt, ind, p))}
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
