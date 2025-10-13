import { Input } from 'antd';
import React from 'react';
import { InputComponent, TSlobsInputProps, useTextInput, ValuesOf } from './inputs';
import InputWrapper from './InputWrapper';
import { InputProps } from 'antd/lib/input';

// select which features from the antd lib we are going to use
// note: to add a submit button for the text input, pass in a button to the `addonAfter` or `addonBefore` prop
export const ANT_INPUT_FEATURES = ['addonBefore', 'addonAfter', 'autoFocus', 'prefix'] as const;

export type TTextInputProps = TSlobsInputProps<
  {
    uncontrolled?: boolean;
    onFocus?: React.FocusEventHandler<HTMLInputElement>;
    onBlur?: React.FocusEventHandler<HTMLInputElement>;
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
    onMouseDown?: React.MouseEventHandler<HTMLInputElement>;
    inputRef?: React.Ref<Input>;
    isPassword?: boolean;
  },
  string,
  InputProps,
  ValuesOf<typeof ANT_INPUT_FEATURES>
>;

export const TextInput = InputComponent((p: TTextInputProps) => {
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
    <InputWrapper {...wrapperAttrs}>
      {p.isPassword && <Input.Password {...textInputAttrs} />}
      {!p.isPassword && <Input {...textInputAttrs} />}
    </InputWrapper>
  );
});
