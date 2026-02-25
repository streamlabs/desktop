import React, { CSSProperties } from 'react';
import styles from './Callout.m.less';
import cx from 'classnames';
import { EDismissable } from 'services/dismissables';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';

interface ICalloutProps {
  type?: 'info' | 'warning' | 'error';
  icon?: string | JSX.Element;
  title?: string | JSX.Element;
  message: string | JSX.Element;
  dismissableKey?: EDismissable;
  className?: string;
  style?: CSSProperties;
}

export default function Callout(p: ICalloutProps) {
  const { shouldShow } = useVuex(() => ({
    shouldShow: p?.dismissableKey
      ? Services.DismissablesService.views.shouldShow(p?.dismissableKey)
      : true,
  }));

  if (!shouldShow) return <></>;

  function handleDismiss(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (!p?.dismissableKey) return;
    e.stopPropagation();
    Services.DismissablesService.actions.dismiss(p?.dismissableKey);
  }

  return (
    <aside
      className={cx(
        styles.callout,
        { [styles.info]: !p.type || p.type === 'info' },
        { [styles.warning]: p.type === 'warning' },
        { [styles.error]: p.type === 'error' },
        p.className,
      )}
      style={p.style}
    >
      {p?.dismissableKey && (
        <i className={cx(styles.close, 'icon-close')} onClick={handleDismiss} />
      )}
      {(p.title || p.icon) ? (
        <title className={styles.title}>
          {p.icon ? (
            typeof p.icon === 'string' ? (
              <i className={cx(styles.icon, p.icon)} />
            ) : (
              <span>{p.icon}</span>
            )
          ) : (
            <i className={cx(
              styles.icon,
              { 'icon-question': !p.type || p.type === 'info' },
              { 'icon-information': p.type === 'warning' },
              { 'icon-error': p.type === 'error' },
            )} />
          )}
          {p.title ? (<span>{p.title}</span>) : (<></>)}
        </title>
      ) : (<></>)}
      <span className={styles.message}>{p.message}</span>
    </aside>
  );
}
