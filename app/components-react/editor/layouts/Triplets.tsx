import React from 'react';
import cx from 'classnames';
import useLayout, { LayoutProps } from './hooks';
import ResizeBar from 'components-react/root/ResizeBar';
import styles from './Layouts.m.less';

export function Triplets(p: React.PropsWithChildren<LayoutProps>) {
  const { mins, bars, resizes, calculateMax, setBar, componentRef } = useLayout(
    [
      ['1', '4'],
      ['2', '5'],
      ['3', '6'],
    ],
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
          className={styles.stacked}
          style={{ width: `${100 - (resizes.bar1 + resizes.bar2) * 100}%` }}
        >
          {['1', '4'].map(slot => (
            <div key={slot} className={styles.cell}>
              {p.children?.[slot] || <></>}
            </div>
          ))}
        </div>
      </ResizeBar>
      <div className={styles.stacked} style={{ width: `${resizes.bar1 * 100}%` }}>
        {['2', '5'].map(slot => (
          <div key={slot} className={styles.cell}>
            {p.children?.[slot] || <></>}
          </div>
        ))}
      </div>
      <ResizeBar
        position="right"
        value={bars.bar2}
        onInput={(value: number) => setBar('bar2', value)}
        max={calculateMax(mins.rest + mins.bar1)}
        min={mins.bar2}
        transformScale={1}
      >
        <div className={styles.stacked} style={{ width: `${resizes.bar2 * 100}%` }}>
          {['3', '6'].map(slot => (
            <div key={slot} className={styles.cell}>
              {p.children?.[slot] || <></>}
            </div>
          ))}
        </div>
      </ResizeBar>
    </div>
  );
}
