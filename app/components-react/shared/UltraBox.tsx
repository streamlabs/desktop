import React from 'react';
import cx from 'classnames';
import styles from './UltraBox.m.less';

export default function UltraBox(
  p: React.PropsWithChildren<{ className?: string; bodyClassName?: string }>,
) {
  return (
    <div className={cx(styles.container, p.className)}>
      <div className={styles.backing} />
      <div className={p.bodyClassName}>{p.children}</div>
    </div>
  );
}
