import React, { useEffect, useMemo, useRef, useState } from 'react';
import debounce from 'lodash/debounce';
import * as remote from '@electron/remote';
import { MenuInfo } from 'rc-menu/lib/interface';
import * as pages from './settings/pages';
import { ESettingsCategory, TCategoryName } from 'services/settings';
import { EDismissable } from 'services/dismissables';
import { Services } from 'components-react/service-provider';
import { useRealmObject } from 'components-react/hooks/realm';
import { useDebounce, useVuex } from 'components-react/hooks';
import { $t } from 'services/i18n';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { Menu } from 'antd';
import Scrollable from 'components-react/shared/Scrollable';
import styles from './Settings.m.less';
import { TextInput } from 'components-react/shared/inputs';
import PlatformLogo from 'components-react/shared/PlatformLogo';
import DismissableBadge from 'components-react/shared/DismissableBadge';
import SearchablePages from 'components-react/shared/SearchablePages';

export interface ISettingsProps {
  globalSearchStr: string;
}

interface ISettingsConfig {
  icon: string;
  component: React.FunctionComponent<ISettingsProps>;
  dismissable?: EDismissable;
}

export const SETTINGS_CONFIG: Record<ESettingsCategory, ISettingsConfig> = {
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
    dismissable: EDismissable.CustomMenuSettings,
  },
  [ESettingsCategory.Mobile]: { icon: 'icon-phone-case', component: pages.MobileSettings },
  [ESettingsCategory.Experimental]: { icon: 'fas fa-flask', component: pages.ExperimentalSettings },
  [ESettingsCategory.InstalledApps]: { icon: 'icon-store', component: pages.InstalledApps },
  [ESettingsCategory.GetSupport]: { icon: 'icon-question', component: pages.Support },
  [ESettingsCategory.AI]: { icon: 'icon-ai', component: pages.AISettings },
  [ESettingsCategory.Ultra]: { icon: 'icon-ultra', component: pages.Ultra },
};

export default function Settings() {
  const {
    SettingsService,
    NavigationService,
    UserService,
    DualOutputService,
    WindowsService,
    DismissablesService,
    UsageStatisticsService,
  } = Services;

  const currentTab = useRealmObject(NavigationService.state).currentSettingsTab;

  const { isPrime, isLoggedIn, username, platform, showDismissable } = useVuex(() => ({
    isPrime: UserService.views.isPrime,
    isLoggedIn: UserService.views.isLoggedIn,
    username: UserService.views.username,
    platform: UserService.views.platform?.type,
    showDismissable: (value: EDismissable) => DismissablesService.views.shouldShow(value),
  }));

  const categories = useMemo(() => SettingsService.getCategories(), [isPrime]);

  useEffect(() => {
    // Make sure we have the latest settings
    SettingsService.actions.loadSettingsIntoStore();
  }, []);

  function setCurrentTab(value: TCategoryName) {
    NavigationService.actions.setSettingsNavigation(value);
  }

  function handleMenuNavigation(event: MenuInfo) {
    setCurrentTab(event.key as TCategoryName);
  }

  function handleAuth() {
    UsageStatisticsService.actions.recordClick('Settings', isLoggedIn ? 'logout' : 'login');
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

  function dismiss(category: TCategoryName) {
    const dismissable = SETTINGS_CONFIG[category].dismissable;
    if (dismissable) DismissablesService.actions.dismiss(dismissable);
  }

  /** PAGE SEARCH LOGIC */
  const [searchStr, setSearchStr] = useState('');

  function handleSearchCompleted(foundPages: TCategoryName[]) {
    const filteredPages = includeUltra(searchStr)
      ? foundPages
      : foundPages.filter(page => page !== 'Ultra');
    setCurrentTab(filteredPages[0]);
  }

  function onSearchInput(str: string) {
    setSearchStr(str);
  }

  function includeUltra(str: string) {
    if (isPrime) return false;
    if (str.length < 6 && str.toLowerCase().startsWith('u')) {
      for (let i = 0; i < 'ultra'.length + 1; i++) {
        if ('ultra'.slice(0, i) === str) {
          return true;
        }
      }
    }
    return false;
  }

  const SettingsContent = SETTINGS_CONFIG[currentTab].component;

  return (
    <ModalLayout bodyClassName={styles.settings}>
      <Scrollable className={styles.settingsNav}>
        <div style={{ padding: '0 24px 12px 24px' }}>
          <TextInput
            prefix={<i className="icon-search" />}
            placeholder={$t('Search')}
            value={searchStr}
            onChange={onSearchInput}
            uncontrolled={false}
            nowrap
          />
        </div>
        <Menu
          mode="inline"
          selectedKeys={[currentTab]}
          onClick={handleMenuNavigation}
          style={{ paddingBottom: '46px' }}
        >
          {categories.map(cat => {
            const config = SETTINGS_CONFIG[cat];
            return (
              <Menu.Item key={cat} icon={<i className={config.icon} />}>
                <div
                  style={{ display: 'flex' }}
                  onClick={() => dismiss(cat)}
                  data-name="settings-nav-item"
                >
                  {$t(cat)}
                  {config.dismissable && showDismissable(config.dismissable) && (
                    <DismissableBadge dismissableKey={config.dismissable} />
                  )}
                </div>
              </Menu.Item>
            );
          })}
        </Menu>
        <div className={styles.settingsAuth} onClick={handleAuth}>
          <i className={isLoggedIn ? 'fas fa-sign-out-alt' : 'fas fa-sign-in-alt'} />
          <strong>{isLoggedIn ? $t('Log Out') : $t('Log In')}</strong>
          {isLoggedIn && platform && <PlatformLogo platform={platform} size="small" />}
          {isLoggedIn && <span>{username}</span>}
        </div>
      </Scrollable>
      <Scrollable className={styles.settingsContainer} snapToWindowEdge>
        <div className={styles.settingsContent}>
          <SearchablePages
            onSearchCompleted={handleSearchCompleted}
            pages={categories}
            page={currentTab}
            searchStr={searchStr}
          >
            <SettingsContent globalSearchStr={searchStr} />
          </SearchablePages>
        </div>
      </Scrollable>
    </ModalLayout>
  );
}
