import React from 'react';
import styles from './Modal.m.less';

/**
 * Shows content above black fade in the middle of the window
 *
 * @Example
 * <Modal>
 *   Loading...
 * </Modal>
 */
export default function Modal(p: React.PropsWithChildren<{}>) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.fader}></div>
      <div className={styles.content}>{p.children}</div>
    </div>
  );
}
