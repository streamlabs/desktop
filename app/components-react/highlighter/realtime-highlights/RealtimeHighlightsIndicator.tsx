import React from 'react';
import RealtimeHighlightsTooltip from './RealtimeHighlightsFeed';
import styles from './RealtimeHighlightsIndicator.m.less';

export default function RealtimeHighlightsIndicator() {
  return (
    <RealtimeHighlightsTooltip placement="topLeft" maxEvents={3}>
      <div className={`${styles.realtimeIndicator} ${styles.fadeIn}`}>
        <div className={styles.statusDot} />
        <span className={styles.statusText}>Ai highlighter active</span>
      </div>
    </RealtimeHighlightsTooltip>
  );
}
