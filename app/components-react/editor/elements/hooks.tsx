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

  useEffect(() => {
    if (!ref) return;

    const handleResize = () => {
      const rect = ref.getBoundingClientRect();
      // 26px added to account for size of the resize bars and padding
      setBelowMins(rect.height + 26 < mins.y || rect.width + 26 < mins.x);
    };

    handleResize();

    const resizeObserver = new window.ResizeObserver(handleResize);
    resizeObserver.observe(ref);

    return () => {
      resizeObserver.disconnect();
    };
  }, [ref, mins.x, mins.y]);

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
