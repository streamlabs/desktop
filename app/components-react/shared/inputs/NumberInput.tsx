import { InputNumber } from 'antd';
import React from 'react';
import { TSlobsInputProps, useTextInput, ValuesOf } from './inputs';
import InputWrapper from './InputWrapper';
import { InputNumberProps } from 'antd/lib/input-number';

// select which features from the antd lib we are going to use
const ANT_NUMBER_FEATURES = ['min', 'max', 'step', 'precision'] as const;

type TProps = TSlobsInputProps<{}, number, InputNumberProps, ValuesOf<typeof ANT_NUMBER_FEATURES>>;

export const NumberInput = React.memo((p: TProps) => {
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
    <InputWrapper {...wrapperAttrs} rules={[{ ...rules, type: 'number' }]}>
      <InputNumber {...inputAttrs} onChange={onChangeHandler} defaultValue={p.defaultValue} />
    </InputWrapper>
  );
});
