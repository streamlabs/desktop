import { TimePicker, TimePickerProps } from 'antd';
import React, { useEffect, useRef } from 'react';
import { InputComponent, TSlobsInputProps, useInput } from './inputs';
import InputWrapper from './InputWrapper';
import moment, { Moment } from 'moment';
import { findDOMNode } from 'react-dom';

export type TTimeInputProps = TSlobsInputProps<{}, number, TimePickerProps>;

export const TimeInput = InputComponent((p: TTimeInputProps) => {
  const { wrapperAttrs, inputAttrs } = useInput('time', p);
  const value = getAntdValue(inputAttrs.value);
  const inputRef = useRef<Element>(null);

  // By some unknown reason the Ant TimePicker renders the input in the `readonly` state
  // Add a dirty fix here
  useEffect(() => {
    const $input: Element = findDOMNode(inputRef.current);
    $input.querySelector('input')!.removeAttribute('readonly');
  });

  function onChange(moment: Moment) {
    /*
       Workaround for having a user-inputted time in the input causing the original date to be reset
       I'm not sure how much of https://ant.design/docs/react/use-custom-date-library#timepicker has been
       done, but it seems like this input does not behave correctly, and I'd assume is due to parsing.
    */
    const isParsed = (moment as any)?._f === undefined;

    const val = isParsed
      ? moment
      : // If the moment is not parsed, it's a user-inputted time, so we need to preserve the original date
        value
          .clone()
          .set('hours', moment.hours())
          .set('minutes', moment.minutes())
          .set('seconds', 0);

    inputAttrs.onChange(val.valueOf() || 0);
  }

  return (
    <InputWrapper {...wrapperAttrs}>
      <TimePicker
        {...inputAttrs}
        ref={inputRef}
        value={value}
        onSelect={onChange}
        onChange={onChange}
        use12Hours
        format="h:mm a"
        showNow={false}
        allowClear={false}
      />
    </InputWrapper>
  );
});

function getAntdValue(value?: number) {
  return moment(value);
}

// tell the Form to convert a timestamp value to a Moment value when call `Form.setFieldsValue`
TimeInput['getAntdValue'] = getAntdValue;
