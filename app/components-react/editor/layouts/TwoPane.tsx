import React, { useRef } from 'react';
import cx from 'classnames';
import useLayout, { LayoutProps } from './hooks';
import ResizeBar from 'components-react/root/ResizeBar';
import styles from './Layouts.m.less';

export function TwoPane(p: React.PropsWithChildren<LayoutProps>) {
  const { mins, bars, resizes, calculateMax, setBar, componentRef } = useLayout(
    [['2'], ['5'], ['1', ['3', '4']]],
    true,
    p.childrenMins,
    p.onTotalWidth,
  );

  return (
    <div className={cx(styles.columns, styles.sidePadded, p.className)} ref={componentRef}>
      <ResizeBar
        position="left"
        value={bars.bar1}
        onInput={(value: number) => setBar('bar1', value)}
        max={calculateMax(mins.rest + bars.bar2)}
        min={mins.bar1}
      >
        <div
          style={{ width: `${100 - (resizes.bar1 + resizes.bar2) * 100}%` }}
          className={styles.cell}
        >
          {p.children?.['2'] || <></>}
        </div>
      </ResizeBar>
      <div className={styles.rows} style={{ width: `${resizes.bar1 * 100}%`, paddingTop: '16px' }}>
        <div style={{ height: '100%' }} className={styles.cell}>
          {p.children?.['1'] || <></>}
        </div>
        <div className={styles.segmented}>
          <div className={styles.cell}>{p.children?.['3'] || <></>}</div>
          <div className={styles.cell}>{p.children?.['4'] || <></>}</div>
        </div>
      </div>
      <ResizeBar
        position="right"
        value={bars.bar2}
        onInput={(value: number) => setBar('bar2', value)}
        max={calculateMax(mins.rest + mins.bar1)}
        min={mins.bar2}
        transformScale={1}
      >
        <div style={{ width: `${resizes.bar2 * 100}%` }} className={styles.cell}>
          {p.children?.['5'] || <></>}
        </div>
      </ResizeBar>
    </div>
  );
}
