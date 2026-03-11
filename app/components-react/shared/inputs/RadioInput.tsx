import React, { CSSProperties } from 'react';
import { InputComponent, TSlobsInputProps, useInput } from './inputs';
import InputWrapper from './InputWrapper';
import styles from './RadioInput.m.less';
import { Radio, Space, Tooltip } from 'antd';
import cx from 'classnames';
import { pick } from 'lodash';

export interface ICustomRadioOption {
  value: string;
  label: string;
  description?: string;
  defaultValue?: string;
  icon?: string;
  tooltip?: string;
}

interface ICustomRadioGroupProps {
  label?: string;
  nolabel?: boolean;
  nowrap?: boolean;
  nomargin?: boolean;
  options: ICustomRadioOption[];
  icons?: boolean;
  style?: CSSProperties;
  value?: string;
  direction?: 'vertical' | 'horizontal';
  disabled?: boolean;
  className?: string;
  gapsize?: number;
  alignIcons?: 'left' | 'center' | 'right';
  optionType?: 'default' | 'button';
}

type TRadioInputProps = TSlobsInputProps<ICustomRadioGroupProps, string, {}>;

export const RadioInput = InputComponent((p: TRadioInputProps) => {
  const { inputAttrs, wrapperAttrs } = useInput('radio', p);

  const inputProps = {
    ...inputAttrs,
    ...pick(p, 'name'),
  };

  const optionType = p.optionType ?? 'default';

  return (
    <InputWrapper
      {...wrapperAttrs}
      data-title={p.label}
      nolabel={p.nolabel}
      className={cx({
        [styles.iconsLeft]: p.alignIcons === 'left',
        [styles.iconsCenter]: p.alignIcons === 'center',
        [styles.iconsRight]: p.alignIcons === 'right',
        [styles.nomargin]: p.nomargin,
      })}
    >
      {optionType === 'button' && !p.icons && (
        <Radio.Group
          {...inputProps}
          data-title={p.label}
          name={p.name}
          value={p.value}
          onChange={e => p.onChange && p.onChange(e.target.value)}
          options={p.options}
          optionType="button"
          disabled={p.disabled}
          className={p.className}
          style={p?.style}
        />
      )}
      {p.icons && (
        <Radio.Group
          {...inputProps}
          data-title={p.label}
          name={p.name}
          value={p.value}
          defaultValue={p.defaultValue}
          onChange={e => p.onChange && p.onChange(e.target.value)}
          className={cx(p.className, styles.iconRadio, {
            [styles.iconDefault]: optionType === 'default',
            [styles.iconButton]: optionType === 'button',
          })}
          style={p?.style}
          disabled={p.disabled}
          optionType={p.optionType}
        >
          {p.options.map((option: ICustomRadioOption) => {
            return (
              <Radio
                key={option.value}
                value={option.value}
                disabled={p.disabled}
                children={
                  option?.tooltip ? (
                    <Tooltip title={option?.tooltip} placement="topRight">
                      <i className={cx(option.icon, styles.iconToggle)} />
                    </Tooltip>
                  ) : (
                    <i className={cx(option.icon, styles.iconToggle)} />
                  )
                }
              />
            );
          })}
        </Radio.Group>
      )}
      {!p.icons && optionType === 'default' && (
        <Radio.Group
          {...inputProps}
          data-title={p.label}
          name={p.name}
          value={p.value}
          defaultValue={p.defaultValue}
          onChange={e => p.onChange && p.onChange(e.target.value)}
          className={p.className}
          style={p?.style}
        >
          <Space size={p?.gapsize ?? undefined} direction={p?.direction ?? 'vertical'}>
            {p.options.map(option => {
              return (
                <Radio
                  key={option.value}
                  value={option.value}
                  disabled={p.disabled}
                  name={`${p.name}-${option.value}`}
                >
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
