import React, { CSSProperties } from 'react';
import styles from './AnimatedWrapper.m.less';
import cx from 'classnames';

interface IAnimatedWrapperProps {
  className?: string;
  visible: boolean;
  style?: CSSProperties;
  children?: React.ReactNode;
  height: string;
  onClick?: (props?: any) => void;
}

export default function AnimatedWrapper(p: IAnimatedWrapperProps) {
  return (
    <div
      className={cx(p?.className, { [styles.visible]: p.visible, [styles.hidden]: !p.visible })}
      style={{ ...p?.style, height: p.height }}
      onClick={p?.onClick}
    >
      {p.children}
    </div>
  );
}
