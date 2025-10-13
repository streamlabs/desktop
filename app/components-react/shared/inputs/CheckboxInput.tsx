import { Checkbox, Tooltip } from 'antd';
import React from 'react';
import { InputComponent, TSlobsInputProps, useInput } from './inputs';
import { CheckboxProps } from 'antd/lib/checkbox';
import { QuestionCircleOutlined } from '@ant-design/icons';

export type TCheckboxInputProps = TSlobsInputProps<{}, boolean, CheckboxProps>;

export const CheckboxInput = InputComponent((p: TCheckboxInputProps) => {
  const { inputAttrs, wrapperAttrs } = useInput('checkbox', p);
  return (
    <div style={wrapperAttrs.style} className={wrapperAttrs.className}>
      <Checkbox
        {...inputAttrs}
        checked={inputAttrs.value}
        onChange={() => inputAttrs.onChange(!inputAttrs.value)}
      >
        {p.label}
        {p.tooltip && (
          <Tooltip title={p.tooltip}>
            <QuestionCircleOutlined style={{ marginLeft: '7px' }} />
          </Tooltip>
        )}
      </Checkbox>
    </div>
  );
});
