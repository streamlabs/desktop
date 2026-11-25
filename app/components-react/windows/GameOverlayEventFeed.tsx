import React from 'react';
import RecentEvents from 'components-react/editor/elements/RecentEvents';
import styles from './GameOverlayEventFeed.m.less';

export default function GameOverlayEventFeed() {
  return (
    <div className={styles.main}>
      <RecentEvents isOverlay />
    </div>
  );
}
