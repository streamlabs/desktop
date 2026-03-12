import styles from './GoLive.m.less';
import React, { HTMLAttributes } from 'react';
import cx from 'classnames';
import InputWrapper from '../../shared/inputs/InputWrapper';

interface ISectionProps {
  title?: string;
  isSimpleMode?: boolean;
}

/**
 * renders a section wrapper
 */
export function Section(p: ISectionProps & HTMLAttributes<unknown>) {
  const title = p.title;

  // render header and section wrapper in advanced mode
  if (!p.isSimpleMode) {
    return (
      <div className={styles.section}>
        {title && <h2 style={{ marginBottom: 0 }}>{title}</h2>}
        <div>{p.children}</div>
      </div>
    );
  }

  // render content only in simple mode
  return <div className={p.className}>{p.children}</div>;
}
