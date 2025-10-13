import { Form, Switch } from 'antd';
import React from 'react';
import { InputComponent, TSlobsInputProps, useInput, ValuesOf } from './inputs';
import InputWrapper from './InputWrapper';
import { SwitchProps } from 'antd/lib/switch';
import styles from './SwitchInput.m.less';
import cx from 'classnames';

// select which features from the antd lib we are going to use
const ANT_SWITCH_FEATURES = ['checkedChildren', 'unCheckedChildren'] as const;

export type TSwitchInputProps = TSlobsInputProps<
  {
    inputRef?: React.Ref<HTMLInputElement>;
    style?: React.CSSProperties;
    name?: string;
    size?: 'small' | 'default';
    color?: 'primary' | 'secondary';
    nolabel?: boolean;
    checkmark?: boolean;
    skipWrapperAttrs?: boolean;
  },
  boolean,
  SwitchProps,
  ValuesOf<typeof ANT_SWITCH_FEATURES>
>;

export const SwitchInput = InputComponent((p: TSwitchInputProps) => {
  const { wrapperAttrs, inputAttrs } = useInput('switch', p, ANT_SWITCH_FEATURES);
  const { size = 'small' } = p;

  const labelAlign = p?.labelAlign || 'right';
  const nowrap = wrapperAttrs?.layout === 'horizontal';
  const attrs = p?.skipWrapperAttrs
    ? { nolabel: p?.nolabel, nowrap }
    : { ...wrapperAttrs, nolabel: p?.nolabel, nowrap };

  /*
   * The horizontal styling shifts the label to follow the switch.
   */
  return wrapperAttrs?.layout === 'horizontal' ? (
    <InputWrapper {...attrs}>
      <Form.Item colon={false} aria-label={p.label} style={p.style}>
        {!p.nolabel && labelAlign === 'left' && (
          <span style={{ marginRight: '10px' }}>{p.label}</span>
        )}
        <Switch
          checked={inputAttrs.value}
          size={size}
          {...inputAttrs}
          ref={p.inputRef}
          className={cx(styles.horizontal, styles.horizontalItem, {
            [styles.checkmark]: p?.checkmark,
            [styles.secondarySwitch]: p?.color === 'secondary',
            [styles.noLabel]: p?.nolabel,
          })}
          checkedChildren={p?.checkmark ? <i className="icon-check-mark" /> : undefined}
        />
        {!p.nolabel && labelAlign === 'right' && (
          <span style={{ marginLeft: '10px' }}>{p.label}</span>
        )}
      </Form.Item>
    </InputWrapper>
  ) : (
    <InputWrapper {...attrs}>
      <Switch
        checked={inputAttrs.value}
        size={size}
        {...inputAttrs}
        ref={p.inputRef}
        className={cx({
          [styles.secondarySwitch]: p?.color === 'secondary',
          [styles.noLabel]: p?.nolabel,
        })}
      />
    </InputWrapper>
  );
});
