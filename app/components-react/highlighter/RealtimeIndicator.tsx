import { Button } from 'antd';
import React, { useState } from 'react';
import { $t } from 'services/i18n';
import styles from './RealtimeIndicator.m.less';
import cx from 'classnames';

export default function HighlightGenerator() {
  const [animateOnce, setAnimateOnce] = useState(false);
  function triggerDetection() {
    if (animateOnce) {
      return;
    }
    setAnimateOnce(true);
    setTimeout(() => {
      setAnimateOnce(false);
    }, 2000);
  }
  return (
    <div className={cx(styles.realtimeDetectionAction)}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <div
          className={cx(styles.backgroundPulse, animateOnce && styles.activityAnimation)}
          // onAnimationEnd={() => setAnimateOnce(false)}
        />
        {animateOnce ? (
          <div className={styles.emoji}>🔫</div>
        ) : (
          <div className={styles.pulseWrapper}>
            <div className={styles.pulse} />
            <div className={styles.dot} />
          </div>
        )}
        <p style={{ margin: 0, zIndex: 3 }}>
          {animateOnce ? $t('Clip detected') : $t('Ai detection in progress')}
        </p>
      </div>
      <Button
        size="small"
        type="ghost"
        className={styles.realtimeCancelButton}
        onClick={e => {
          e.stopPropagation();
          triggerDetection();
          console.log('TODO: Cancel realtime detection');
        }}
      >
        <i className="icon-close" />
      </Button>
    </div>
  );
}
