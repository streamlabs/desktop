import React, { CSSProperties } from 'react';
import styles from './InfoBanner.m.less';
import cx from 'classnames';
import { EDismissable } from 'services/dismissables';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';

interface IInfoBannerProps {
  id?: string;
  message: string | JSX.Element;
  type?: 'info' | 'warning';
  style?: CSSProperties;
  className?: string;
  onClick?: () => void;
  dismissableKey?: EDismissable;
}

export default function InfoBanner(p: IInfoBannerProps) {
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

  function handleOnClick(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    // this allows the banner to only be dismissed if the user clicks the x
    if (!p?.onClick) return;
    e.stopPropagation();
    p?.onClick();
  }

  return (
    <div
      id={p?.id}
      className={cx(
        styles.infoBanner,
        { [styles.info]: p.type === 'info' },
        { [styles.warning]: p.type === 'warning' },
        p.className,
      )}
      style={p.style ?? undefined}
      onClick={handleOnClick}
    >
      <i className="icon-information" />
      <span className={styles.message}>{p.message}</span>
      {p?.dismissableKey && (
        <i className={cx(styles.close, 'icon-close')} onClick={handleDismiss} />
      )}
    </div>
  );
}
