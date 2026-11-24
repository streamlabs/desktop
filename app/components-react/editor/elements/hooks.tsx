import React, { useEffect, useState } from 'react';
import { $t } from 'services/i18n';
import styles from './BaseElement.m.less';
import Scrollable from 'components-react/shared/Scrollable';
import { observeResize } from 'util/observe-resize';

/**
 * Wraps an editor element so it shows a "too small" warning instead of its content when the
 * container (`containerRef`, rendered by the caller) gets smaller than `mins`.
 */
export default function useBaseElement(
  element: React.ReactNode,
  mins: IVec2,
  containerRef: React.RefObject<HTMLElement>,
) {
  const [belowMins, setBelowMins] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    return observeResize(container, () => {
      const { width, height } = container.getBoundingClientRect();
      // 26px added to account for size of the resize bars and padding.
      // Only the boolean is stored so resizing doesn't re-render the element on every change.
      setBelowMins(height + 26 < mins.y || width + 26 < mins.x);
    });
  }, []);

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
