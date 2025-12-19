import React, { useEffect, useState } from 'react';
import { $t } from 'services/i18n';
import styles from './BaseElement.m.less';
import Scrollable from 'components-react/shared/Scrollable';

export default function useBaseElement(
  element: React.ReactNode,
  mins: IVec2,
  ref: HTMLDivElement | null,
) {
  const [belowMins, setBelowMins] = useState(false);
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);

  let sizeWatcherInterval = 0;
  const sizeWatcherCallbacks: Function[] = [];

  function addSizeWatcher(cb: Function) {
    sizeWatcherCallbacks.push(cb);
    if (sizeWatcherInterval) return;
    sizeWatcherInterval = window.setInterval(() => {
      sizeWatcherCallbacks.forEach(cb => cb());
    }, 500);
  }

  function removeSizeWatcher(cb: Function) {
    const idx = sizeWatcherCallbacks.findIndex(func => func === cb);
    if (idx !== -1) sizeWatcherCallbacks.splice(idx, 1);
    if (sizeWatcherCallbacks.length < 1) {
      clearInterval(sizeWatcherInterval);
      sizeWatcherInterval = 0;
    }
  }

  useEffect(() => {
    const sizeWatcher = () => {
      if (!ref || !ref.getBoundingClientRect) return;
      setHeight(ref.getBoundingClientRect().height);
      setWidth(ref.getBoundingClientRect().width);
    };

    sizeWatcher();
    addSizeWatcher(sizeWatcher);

    return () => removeSizeWatcher(sizeWatcher);
  }, []);

  useEffect(() => {
    if (!ref) return;
    // 26px added to account for size of the resize bars and padding
    setBelowMins(height + 26 < mins.y || width + 26 < mins.x);
  }, [width, height]);

  function renderElement() {
    return belowMins ? <BelowMinWarning /> : element;
  }

  return { renderElement };
}

function BelowMinWarning() {
  return (
    <Scrollable className={styles.container}>
      <span className={styles.empty}>{$t('This element is too small to be displayed')}</span>
    </Scrollable>
  );
}
