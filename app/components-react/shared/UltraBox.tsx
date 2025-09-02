import React from 'react';
import styles from './UltraBox.m.less';

export default function UltraBox(p: React.PropsWithChildren<{}>) {
  return (
    <div className={styles.container}>
      <div className={styles.backing} />
      <div>{p.children}</div>
    </div>
  );
}
