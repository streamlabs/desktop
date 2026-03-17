import styles from './GoLive.m.less';
import React, { HTMLAttributes } from 'react';

interface ISectionProps {
  title?: string;
  isSimpleMode?: boolean;
}

/**
 * renders a section wrapper
 * @remark `isSimpleMode` prop is left in for legacy purposes even though the latest
 * Go Live window UI only has one mode
 */
export function Section(p: ISectionProps & HTMLAttributes<unknown>) {
  const title = p.title;

  // render header and section wrapper in advanced mode
  if (!p.isSimpleMode) {
    return (
      <div className={styles.section}>
        {title && <h2>{title}</h2>}
        <div>{p.children}</div>
      </div>
    );
  }

  // render content only in simple mode
  return <div className={p.className}>{p.children}</div>;
}
