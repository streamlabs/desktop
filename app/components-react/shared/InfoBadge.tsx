import React, { CSSProperties } from 'react';
import styles from './InfoBadge.m.less';
import cx from 'classnames';

interface IInfoBadge {
  content: string | React.ReactElement;
  className?: string;
  style?: CSSProperties;
  hasMargin?: boolean;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  bgColor?: string;
}

export default function InfoBadge(p: IInfoBadge) {
  return (
    <div
      className={cx(p.className, styles.infoBadge, {
        [styles.margin]: p.hasMargin,
        [styles.sm]: p.size === 'sm',
      })}
      style={{
        ...p.style,
        color: `${p.color} !important`,
        backgroundColor: `${p.bgColor} !important`,
      }}
    >
      {p.content}
    </div>
  );
}
