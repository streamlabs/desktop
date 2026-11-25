import React from 'react';
import Utils from 'services/utils';
import { Services } from 'components-react/service-provider';
import styles from './OverlayPlaceholder.m.less';

export default function OverlayPlaceholder() {
  const { WindowsService } = Services;
  // The title is stored on the one-off window options, not in queryParams
  const title = WindowsService.state[Utils.getCurrentUrlParams().windowId]?.title;

  return (
    <div className={styles.container}>
      <div className={styles.outline}>
        <h1 className={styles.title}>{title}</h1>
      </div>
    </div>
  );
}
