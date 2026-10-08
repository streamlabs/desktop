import React from 'react';
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

  const { poppedOut } = useVuex(() => ({
    poppedOut: PlatformAppsService.views
      .getApp(p.params.appId)
      ?.poppedOutSlots.find(slot => slot === pageSlot),
  }));

  return (
    <div className={cx(styles.container, p.className)} style={{ margin: poppedOut && '20px' }}>
      {poppedOut ? (
        $t('This app is currently popped out in another window.')
      ) : (
        <>
          <div className={styles.header}>
            <button
              className={styles.textButton}
              onClick={() => NavigationService.actions.navigate('PlatformAppStore')}
            >
              <i className="icon-back" />
              {$t('Back')}
            </button>
            <button
              className={styles.textButton}
              onClick={() => PlatformAppsService.actions.popOutAppPage(p.params.appId, pageSlot)}
            >
              <i className="icon-pop-out-2" />
              {$t('Pop Out App')}
            </button>
          </div>
          <div className={styles.appViewWrapper}>
            <PlatformAppPageView
              appId={p.params.appId}
              pageSlot={pageSlot}
              key={p.params.appId}
              style={{ height: '100%', width: '100%', position: 'absolute' }}
            />
          </div>
        </>
      )}
    </div>
  );
}
