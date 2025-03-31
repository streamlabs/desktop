import React from 'react';
import styles from './UpdateModal.m.less';

export default function Modal({
  version,
  progress,
  isVisible,
}: {
  version: string;
  progress: number;
  isVisible: boolean;
}) {
  if (!isVisible) return null;

  let subtitle;
  if (progress >= 100) {
    subtitle = <h3 className={styles.subtitle}>Installing...</h3>;
  } else {
    subtitle = <h3 className={styles.subtitle}>{Math.round(progress)}% complete</h3>;
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Downloading version {version}</h2>
        {subtitle}
        <div className={styles.progressBarContainer}>
          <div
            className={styles.progressBar}
            style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}
