import React from 'react';
import electron from 'electron';
import { Button } from 'antd';
import { Services } from '../../service-provider';
import { useVuex } from '../../hooks';
import { ISourceApi } from '../../../services/sources';
import { IPlatformAppManagerSettings } from '../../../services/sources/properties-managers/platform-app-manager';
import { ENavMenuKey } from '../../../services/nav-menu';

interface IProps {
  source: ISourceApi;
  onUpdate?: () => void;
}

export default function PlatformAppProperties(p: IProps) {
  const { NavigationService, PlatformAppsService, WindowsService, NavMenuService } = Services;

  const appId = (p.source.getPropertiesManagerSettings() as IPlatformAppManagerSettings).appId;
  const app = useVuex(() => PlatformAppsService.views.getApp(appId));
  const browserUrl = p.source.getSettings().url;

  function navigateApp() {
    NavigationService.navigate('PlatformAppMainPage', {
      appId,
      sourceId: p.source.sourceId,
    });
    NavMenuService.setCurrentMenuItem(ENavMenuKey.AppStore);
    WindowsService.closeChildWindow();
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {app ? (
        <div>
          <p>This source is managed by {app.manifest.name}</p>
          <Button onClick={navigateApp}>Open App Settings</Button>
          {app.unpacked && (
            <div style={{ padding: '8px 0', fontSize: 12 }}>
              <i>
                For debugging, you may find it easier to test your widget in an external browser.
                You may copy/paste the following URL into a browser of your choice.
              </i>
              <div style={{ display: 'flex' }}>
                <input
                  type="text"
                  readOnly
                  value={browserUrl}
                  style={{ flexGrow: 1, marginRight: 8 }}
                />
                <Button onClick={() => electron.clipboard.writeText(browserUrl)}>Copy</Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>This app has been uninstalled and this source should be removed.</div>
      )}
    </div>
  );
}
