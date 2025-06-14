import React from 'react';
import cx from 'classnames';
import useLayout, { LayoutProps } from './hooks';
import ResizeBar from 'components-react/root/ResizeBar';
import styles from './Layouts.m.less';

export function FourByFour(p: React.PropsWithChildren<LayoutProps>) {
  const { mins, bars, resizes, calculateMax, setBar, componentRef } = useLayout(
    [['1'], ['2', '3'], ['4', '5']],
    false,
    p.childrenMins,
    p.onTotalWidth,
  );

  return (
    <div className={cx(styles.rows, p.className)} ref={componentRef}>
      <div
        className={styles.cell}
        style={{ height: `${100 - (resizes.bar1 + resizes.bar2) * 100}%` }}
      >
        {p.children?.['1'] || <></>}
      </div>
      <ResizeBar
        position="top"
        value={bars.bar1}
        onInput={(value: number) => setBar('bar1', value)}
        max={calculateMax(mins.rest + bars.bar2)}
        min={mins.bar1}
      >
        <div className={styles.segmented} style={{ height: `${resizes.bar1 * 100}%` }}>
          <div className={cx(styles.cell, 'no-top-padding')}>{p.children?.['2'] || <></>}</div>
          <div className={cx(styles.cell, 'no-top-padding')}>{p.children?.['3'] || <></>}</div>
        </div>
      </ResizeBar>
      <ResizeBar
        position="top"
        value={bars.bar2}
        onInput={(value: number) => setBar('bar2', value)}
        max={calculateMax(mins.rest + mins.bar1)}
        min={mins.bar2}
      >
        <div
          className={styles.segmented}
          style={{ height: `${resizes.bar2 * 100}%`, padding: '0 8px' }}
        >
          <div className={cx(styles.cell, 'no-top-padding')}>{p.children?.['4'] || <></>}</div>
          <div className={cx(styles.cell, 'no-top-padding')}>{p.children?.['5'] || <></>}</div>
        </div>
      </ResizeBar>
    </div>
  );
}
