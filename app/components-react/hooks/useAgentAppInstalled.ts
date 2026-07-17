import { useEffect } from 'react';
import { useVuex } from 'components-react/hooks';
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
 *
 * Reads reactively off PlatformAppsService's Vuex state (rather than local
 * component state) so every consumer of this hook — e.g. the automations
 * list and its edit modal — stays in sync the instant the app is installed
 * or enabled anywhere, without needing to remount.
 */
export function useAgentAppInstalled() {
  const { NavigationService, PlatformAppsService, SideNavService } = Services;

  useEffect(() => {
    if (getOS() !== OS.Windows) return;
    // No cleanup needed: loadProductionApps() is fire-and-forget; results are
    // read reactively via useVuex and not held in local component state.
    void PlatformAppsService.actions.return.loadProductionApps();
  }, []);

  const { isInstalled, isEnabled } = useVuex(() => {
    if (getOS() !== OS.Windows) return { isInstalled: false, isEnabled: false };
    const app = PlatformAppsService.views.state.loadedApps.find(a => a.id === AGENT_APP_ID);
    return { isInstalled: !!app, isEnabled: !!app?.enabled || !!app?.unpacked };
  });

  async function installAgent() {
    await PlatformAppsService.actions.return.refreshProductionApps();
    NavigationService.actions.navigate('PlatformAppStore', { appId: AGENT_APP_STORE_ID });
    SideNavService.actions.setCurrentMenuItem(EMenuItemKey.AppStore);
  }

  function enableAgent() {
    PlatformAppsService.actions.setEnabled(AGENT_APP_ID, true);
  }

  return { isInstalled, isEnabled, installAgent, enableAgent };
}
