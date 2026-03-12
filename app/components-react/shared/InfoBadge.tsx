import React, { CSSProperties } from 'react';
import styles from './InfoBadge.m.less';
import cx from 'classnames';

interface IInfoBadge {
  content: string | React.ReactElement;
  className?: string;
  style?: CSSProperties;
  hasMargin?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function InfoBadge(p: IInfoBadge) {
  return (
    <div
      className={cx(p.className, styles.infoBadge, {
        [styles.margin]: p.hasMargin,
        [styles.lg]: p.size === 'lg',
      })}
      style={p.style}
    >
      {p.content}
    </div>
  );
}
