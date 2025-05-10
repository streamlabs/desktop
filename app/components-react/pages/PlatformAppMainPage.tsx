import React from 'react';
import { EAppPageSlot } from 'services/platform-apps';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import PlatformAppPageView from 'components-react/shared/PlatformAppPageView';
import { useVuex } from 'components-react/hooks';

export default function PlatformAppMainPage(p: { params: { appId: string }; className?: string }) {
  const { PlatformAppsService } = Services;
  const pageSlot = EAppPageSlot.TopNav;

  const { poppedOut } = useVuex(() => ({
    poppedOut: PlatformAppsService.views
      .getApp(p.params.appId)
      ?.poppedOutSlots.find(slot => slot === pageSlot),
  }));

  return (
    <div
      className={p.className}
      style={{ height: '100%', width: '100%', margin: poppedOut && '20px' }}
    >
      {poppedOut ? (
        $t('This app is currently popped out in another window.')
      ) : (
        <PlatformAppPageView
          appId={p.params.appId}
          pageSlot={pageSlot}
          key={p.params.appId}
          style={{ height: '100%' }}
        />
      )}
    </div>
  );
}
