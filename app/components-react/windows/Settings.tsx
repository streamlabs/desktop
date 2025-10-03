import React, { useEffect, useRef, useState } from 'react';
import debounce from 'lodash/debounce';
import remote from '@electron/remote';
import * as pages from './settings/pages';
import { ESettingsCategory } from 'services/settings';
import { EDismissable } from 'services/dismissables';
import { Services } from 'components-react/service-provider';
import { useRealmObject } from 'components-react/hooks/realm';
import { useVuex } from 'components-react/hooks';
import { $t } from 'services/i18n';

const SETTINGS_CONFIG: Record<ESettingsCategory, any> = {
  [ESettingsCategory.General]: { icon: 'icon-overview', component: pages.GeneralSettings },
  [ESettingsCategory.Multistreaming]: {
    icon: 'icon-multistream',
    component: pages.MultistreamingSettings,
  },
  [ESettingsCategory.Stream]: { icon: 'fas fa-globe', component: pages.StreamSettings },
  [ESettingsCategory.Output]: { icon: 'fas fa-microchip', component: pages.OutputSettings },
  [ESettingsCategory.Video]: { icon: 'fas fa-film', component: pages.VideoSettings },
  [ESettingsCategory.Audio]: { icon: 'icon-audio', component: pages.AudioSettings },
  [ESettingsCategory.Hotkeys]: { icon: 'icon-settings', component: pages.Hotkeys },
  [ESettingsCategory.GameOverlay]: { icon: 'icon-full-screen', component: pages.GameOverlay },
  [ESettingsCategory.VirtualWebcam]: {
    icon: 'fas fa-camera',
    component: pages.VirtualWebcamSettings,
  },
  [ESettingsCategory.Advanced]: { icon: 'fas fa-cogs', component: pages.AdvancedSettings },
  [ESettingsCategory.Developer]: { icon: 'far fa-file-code', component: pages.DeveloperSettings },
  [ESettingsCategory.SceneCollections]: { icon: 'icon-themes', component: pages.OverlaySettings },
  [ESettingsCategory.Notifications]: {
    icon: 'icon-notifications',
    component: pages.NotificationSettings,
  },
  [ESettingsCategory.Appearance]: {
    icon: 'icon-settings-3-1',
    component: pages.AppearanceSettings,
    dismissables: new Set([EDismissable.CustomMenuSettings]),
  },
  [ESettingsCategory.Mobile]: { icon: 'icon-phone-case', component: pages.MobileSettings },
  [ESettingsCategory.Experimental]: { icon: 'fas fa-flask', component: pages.ExperimentalSettings },
  [ESettingsCategory.InstalledApps]: { icon: 'icon-store', component: pages.InstalledApps },
  [ESettingsCategory.GetSupport]: { icon: 'icon-question', component: pages.Support },
  [ESettingsCategory.AI]: { icon: 'icon-ai', component: pages.AISettings },
};

export default function Settings() {
  const {
    SettingsService,
    NavigationService,
    UserService,
    DualOutputService,
    WindowsService,
    DismissablesService,
  } = Services;

  const currentTab = useRealmObject(NavigationService.state).currentSettingsTab;

  const { isPrime, isLoggedIn, username, categories } = useVuex(() => ({
    isPrime: UserService.views.isPrime,
    isLoggedIn: UserService.views.isLoggedIn,
    username: UserService.views.username,
    categories: SettingsService.views.categories,
  }));

  useEffect(() => {
    // Make sure we have the latest settings
    SettingsService.actions.loadSettingsIntoStore();
  }, []);

  function setCurrentTab(value: ESettingsCategory) {
    NavigationService.actions.setSettingsNavigation(value);
  }

  function handleAuth() {
    if (isLoggedIn) {
      remote.dialog
        .showMessageBox({
          title: $t('Confirm'),
          message: $t('Are you sure you want to log out %{username}?', {
            username,
          }),
          buttons: [$t('Yes'), $t('No')],
        })
        .then(({ response }) => {
          if (response === 0) {
            DualOutputService.actions.return.setDualOutputModeIfPossible(false, true).then(() => {
              UserService.actions.logOut();
            });
          }
        });
    } else {
      WindowsService.actions.closeChildWindow();
      UserService.actions.showLogin();
    }
  }

  function dismiss(category: ESettingsCategory, dismissable: EDismissable) {
    const dismissables = SETTINGS_CONFIG[category].dismissables;
    if (dismissables.has(dismissable)) DismissablesService.actions.dismiss(dismissable);
  }

  /** PAGE SEARCH LOGIC */
  const originalTab = useRef<ESettingsCategory | null>(null);
  const scanningDone = useRef(true);
  const [searchStr, setSearchStr] = useState('');
  const [searchResultPages, setSearchResultPages] = useState<ESettingsCategory[]>([]);

  function onBeforePageScanHandler(page: ESettingsCategory) {
    if (originalTab.current === null) {
      originalTab.current = currentTab;
    }

    setCurrentTab(page);
  }

  function onScanCompletedHandler() {
    scanningDone.current = true;
    if (originalTab.current) {
      setCurrentTab(originalTab.current);
    }
    originalTab.current = null;
  }

  function onSearchCompletedHandler(foundPages: ESettingsCategory[]) {
    if (!isPrime && includeUltra(searchStr)) {
      setSearchResultPages([...foundPages, ESettingsCategory.Ultra]);
    } else {
      setSearchResultPages(foundPages);
    }
    // if there are not search results for the current page than switch to the first found page
    if (foundPages.length && !foundPages.includes(currentTab)) {
      setCurrentTab(foundPages[0]);
    }
  }

  function onPageRenderHandler(page: ESettingsCategory) {
    // hotkeys.vue has a delayed rendering, we have to wait before scanning
    if (page === ESettingsCategory.Hotkeys) return new Promise(r => setTimeout(r, 500));
  }

  function onSearchInput(str: string) {
    if (scanningDone.current) {
      setSearchStr(str);
    } else {
      debouncedSearchInput(str);
    }
  }

  function includeUltra(str: string) {
    if (str.length < 6 && str.toLowerCase().startsWith('u')) {
      for (let i = 0; i < 'ultra'.length + 1; i++) {
        if ('ultra'.slice(0, i) === str) {
          return true;
        }
      }
    }
    return false;
  }

  function debouncedSearchInput(str: string) {
    debounce(() => setSearchStr(str), 300);
  }

  //   highlightSearch(searchStr: string) {
  //     this.$refs.settingsContainer?.highlightPage(searchStr);
  //   }

  return <></>;
}
