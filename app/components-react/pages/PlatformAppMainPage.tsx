import React, { useCallback } from 'react';
import cx from 'classnames';
import { EAppPageSlot } from 'services/platform-apps';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import PlatformAppPageView from 'components-react/shared/PlatformAppPageView';
import { useVuex } from 'components-react/hooks';
import styles from './PlatformAppMainPage.m.less';

export default function PlatformAppMainPage(p: { params: { appId: string }; className?: string }) {
  const { PlatformAppsService, NavigationService } = Services;
  const pageSlot = EAppPageSlot.TopNav;

  // `useVuex` only captures its selector once, and this component instance is reused when
  // navigating between apps, so the selector must not depend on `p.params.appId`.
  const { poppedOutAppIds } = useVuex(() => ({
    poppedOutAppIds: PlatformAppsService.views.enabledApps
      .filter(app => app.poppedOutSlots.includes(pageSlot))
      .map(app => app.id),
  }));
  const poppedOut = poppedOutAppIds.includes(p.params.appId);

  const popOutApp = useCallback(
    (appId: string) =>
      PlatformAppsService.actions.popOutAppPage(appId, EAppPageSlot.TopNav, { center: true }),
    [],
  );

  return (
    <div className={cx(styles.container, p.className)}>
      <div className={styles.header}>
        <button
          className={styles.textButton}
          onClick={() => NavigationService.actions.navigate('PlatformAppStore')}
        >
          <i className="icon-back" />
          {$t('Back')}
        </button>
        {!poppedOut && (
          <button className={styles.textButton} onClick={() => popOutApp(p.params.appId)}>
            <i className="icon-pop-out-2" />
            {$t('Pop Out App')}
          </button>
        )}
      </div>
      {poppedOut ? (
        <div className={styles.poppedOutMessage}>
          {$t('This app is currently popped out in another window.')}
        </div>
      ) : (
        <div className={styles.appViewWrapper}>
          <PlatformAppPageView
            appId={p.params.appId}
            pageSlot={pageSlot}
            key={p.params.appId}
            style={{ height: '100%', width: '100%', position: 'absolute' }}
          />
        </div>
      )}
    </div>
  );
}
