import React from 'react';
import styles from './UpdateModal.m.less';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';

export default function Modal() {
  const { HighlighterService } = Services;

  const v = useVuex(() => ({
    isUpdaterRunning: HighlighterService.views.isUpdaterRunning,
    highlighterVersion: HighlighterService.views.highlighterVersion,
    progress: HighlighterService.views.updaterProgress,
  }));

  if (!v.isUpdaterRunning) return null;

  let subtitle;
  if (v.progress >= 100) {
    subtitle = <h3 className={styles.subtitle}>Installing...</h3>;
  } else {
    subtitle = <h3 className={styles.subtitle}>{Math.round(v.progress)}% complete</h3>;
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Downloading version {v.highlighterVersion}</h2>
        {subtitle}
        <div className={styles.progressBarContainer}>
          <div
            className={styles.progressBar}
            style={{ width: `${Math.min(Math.max(v.progress, 0), 100)}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}
