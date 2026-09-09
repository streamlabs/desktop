import React from 'react';
import styles from './GoLive.m.less';
import InfoBanner from 'components-react/shared/InfoBanner';
import { EDismissable } from 'services/dismissables';

interface IGoLiveInfoBannerProps {
  message: string | JSX.Element;
  onClick?: () => void;
  dismissableKey?: EDismissable;
}

export function GoLiveInfoBanner(p: IGoLiveInfoBannerProps) {
  return (
    <div className={styles.infoBannerWrapper}>
      <InfoBanner
        message={p.message}
        type="info"
        className={styles.infoBanner}
        onClick={p.onClick}
        dismissableKey={p.dismissableKey}
      />
    </div>
  );
}

export default GoLiveInfoBanner;
