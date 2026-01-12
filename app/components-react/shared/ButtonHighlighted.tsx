import React, { CSSProperties, SVGProps } from 'react';
import { Button, ButtonProps } from 'antd';
import cx from 'classnames';
import styles from './ButtonHighlighted.m.less';

interface IButtonHighlighted extends ButtonProps {
  icon?: SVGProps<SVGElement> | HTMLDivElement;
  className?: string;
  disabled?: boolean;
  style?: CSSProperties;
  filled?: boolean;
  faded?: boolean;
  text?: string;
  noMargin?: boolean;
  onClick?: () => void;
}

export default function ButtonHighlighted(p: IButtonHighlighted) {
  return (
    <Button
      className={cx(
        styles.highlighted,
        p.className,
        { [styles.filled]: p.filled },
        { [styles.faded]: p.faded },
        { [styles.noMargin]: p.noMargin },
      )}
      style={p.style}
      onClick={p.onClick}
      disabled={p.disabled}
    >
      {p.icon}
      {p.text}
      {p.children}
    </Button>
  );
}
