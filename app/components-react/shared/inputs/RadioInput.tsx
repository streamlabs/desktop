import React from 'react';
import { InputComponent, TSlobsInputProps } from './inputs';
import InputWrapper from './InputWrapper';
import { Radio, Space } from 'antd';
import omit from 'lodash/omit';

type TRadioInputProps = TSlobsInputProps<
  {
    label?: string;
    nolabel?: boolean;
    nowrap?: boolean;
    options: { value: string; label: string; description?: string; defaultValue?: string }[];
    buttons?: boolean;
    direction?: 'vertical' | 'horizontal';
    disabled?: boolean;
    className?: string;
    gapsize?: number;
  },
  string,
  {}
>;

export const RadioInput = InputComponent((p: TRadioInputProps) => {
  const wrapperProps = omit(
    p,
    'options',
    'buttons',
    'disabled',
    'direction',
    'onChange',
    'value',
    'defaultValue',
  );

  return (
    <InputWrapper {...wrapperProps}>
      {p.buttons && (
        <Radio.Group
          value={p.value}
          onChange={e => p.onChange && p.onChange(e.target.value)}
          options={p.options}
          optionType="button"
          buttonStyle="solid"
          disabled={p.disabled}
          className={p.className}
        />
      )}
      {!p.buttons && (
        <Radio.Group
          value={p.value}
          defaultValue={p.defaultValue}
          onChange={e => p.onChange && p.onChange(e.target.value)}
          className={p.className}
        >
          <Space size={p?.gapsize ?? undefined} direction={p?.direction ?? 'vertical'}>
            {p.options.map(option => {
              return (
                <Radio key={option.value} value={option.value} disabled={p.disabled}>
                  {option.label}
                  {option.description && <br />}
                  {option.description && <span style={{ fontSize: 12 }}>{option.description}</span>}
                </Radio>
              );
            })}
          </Space>
        </Radio.Group>
      )}
    </InputWrapper>
  );
});
