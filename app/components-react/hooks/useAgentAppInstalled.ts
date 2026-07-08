import { useEffect, useState } from 'react';
import { Services } from 'components-react/service-provider';
import { EMenuItemKey } from 'services/side-nav';
import { getOS, OS } from 'util/operating-systems';

export const AGENT_APP_STORE_ID = '7643';
export const AGENT_APP_ID = '93125d1c33';

/**
 * Tracks whether the Intelligent Streaming Agent (co-host) platform app is
 * installed and enabled, and exposes helpers to install or (re-)enable it —
 * the same detection/redirect logic AILanding.tsx uses for its co-host
 * feature card. Installed and enabled are tracked separately since a user
 * can install the app but later disable it from Settings > Installed Apps.
 */
export function useAgentAppInstalled() {
  const { NavigationService, PlatformAppsService, SideNavService } = Services;
  const [isInstalled, setIsInstalled] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    let processing = false;

    void loadProductionApps();

    return () => {
      active = false;
    };

    async function loadProductionApps() {
      if (getOS() !== OS.Windows) return;
      if (processing) return;

      processing = true;
      setIsInstalled(false);
      setIsEnabled(false);
      await PlatformAppsService.actions.return.loadProductionApps();

      if (!active) return;

      const app = PlatformAppsService.views.productionApps.find(a => a.id === AGENT_APP_ID);
      setIsInstalled(!!app);
      setIsEnabled(!!app?.enabled);
      processing = false;
    }
  }, []);

  async function installAgent() {
    await PlatformAppsService.actions.return.refreshProductionApps();
    NavigationService.actions.navigate('PlatformAppStore', { appId: AGENT_APP_STORE_ID });
    SideNavService.actions.setCurrentMenuItem(EMenuItemKey.AppStore);
  }

  function enableAgent() {
    PlatformAppsService.actions.setEnabled(AGENT_APP_ID, true);
    setIsEnabled(true);
  }

  return { isInstalled, isEnabled, installAgent, enableAgent };
}
