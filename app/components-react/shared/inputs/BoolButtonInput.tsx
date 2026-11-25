import React from 'react';
import cx from 'classnames';
import { InputComponent, TSlobsInputProps, useInput } from './inputs';
import styles from './BoolButtonInput.m.less';
import { Tooltip } from 'antd';
import { TooltipPlacement } from 'antd/lib/tooltip';

interface IBoolButtonInputCustomProps {
  checkboxStyles?: React.CSSProperties;
  checkboxActiveStyles?: React.CSSProperties;
  tooltip?: string;
  tooltipPlacement?: TooltipPlacement;
  label?: string;
}

export type TBoolButtonInputProps = TSlobsInputProps<IBoolButtonInputCustomProps, boolean>;

export const BoolButtonInput = InputComponent((p: TBoolButtonInputProps) => {
  let customStyles = { ...p.checkboxStyles };

  if (p.value) {
    customStyles = {
      ...customStyles,
      ...p.checkboxActiveStyles,
    };
  }

  function handleClick(e: React.MouseEvent) {
    if (p.disabled) return;
    if (p.onChange) p.onChange(!p.value);
  }

  return (
    <Tooltip title={p.tooltip} placement={p.tooltipPlacement}>
      <div
        className={cx('input-wrapper', { disabled: p.disabled })}
        data-role="input"
        data-type="bool-button"
        data-value={!!p.value}
        data-name={p.name}
      >
        <div
          className={cx(styles.boolButton, { [styles.active]: !!p.value })}
          style={customStyles}
          onClick={handleClick}
        >
          {p.label || (p.value && <i className="fa fa-check" />)}
        </div>
      </div>
    </Tooltip>
  );
});
