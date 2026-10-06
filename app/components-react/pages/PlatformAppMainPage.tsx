import React from 'react';
import { Button } from 'antd';
import { EAppPageSlot } from 'services/platform-apps';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import PlatformAppPageView from 'components-react/shared/PlatformAppPageView';
import { useVuex } from 'components-react/hooks';

export default function PlatformAppMainPage(p: { params: { appId: string }; className?: string }) {
  const { PlatformAppsService, NavigationService } = Services;
  const pageSlot = EAppPageSlot.TopNav;

  const { poppedOut } = useVuex(() => ({
    poppedOut: PlatformAppsService.views
      .getApp(p.params.appId)
      ?.poppedOutSlots.find(slot => slot === pageSlot),
  }));

  return (
    <div
      className={p.className}
      style={{ height: '100%', width: '100%', margin: poppedOut && '20px', display: 'flex', flexDirection: 'column' }}
    >
      {poppedOut ? (
        $t('This app is currently popped out in another window.')
      ) : (
        <>
          <div style={{ padding: '10px', display: 'flex', gap: '10px' }}>
            <Button type="primary" onClick={() => NavigationService.actions.navigate('PlatformAppStore')}>
              {$t('Back to Apps')}
            </Button>
            <Button type="primary" onClick={() => PlatformAppsService.actions.popOutAppPage(p.params.appId, pageSlot)}>
              {$t('Pop Out App')}
            </Button>
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
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
