import React from 'react';
import { InputComponent, TSlobsInputProps } from './inputs';
import InputWrapper from './InputWrapper';
import { IRadioGroupMetadata } from './metadata';
import { RadioInput } from './RadioInput';

type TRadioGroupProps = TSlobsInputProps<
  IRadioGroupMetadata & {
    index?: number;
    platform?: string;
    nolabel?: boolean;
    title?: string;
    value: string;
    defaultValue: string;
    options: {
      value: string;
      label: string;
      description?: string;
      defaultValue?: string;
      icon?: string;
    }[];
  },
  string
>;

export const RadioGroup = InputComponent((p: TRadioGroupProps) => {
  return (
    <InputWrapper
      // label={p.label}
      rules={p.rules}
      name={p.name}
      nolabel={p?.nolabel}
      layout="horizontal"
      nowrap={true}
    >
      <RadioInput
        name={p.name}
        data-title={p.title}
        nolabel={p?.nolabel}
        label={p.title}
        direction="horizontal"
        gapsize={0}
        defaultValue={p.defaultValue}
        options={p.options}
        onChange={(key: string) => (value: any) => p.onChange(value)}
        value={p.value}
        className={p?.className}
        style={p?.style}
        icons={true}
      />
    </InputWrapper>
  );
});
