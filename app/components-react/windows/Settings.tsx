import React, { useEffect, useRef, useState } from 'react';
import debounce from 'lodash/debounce';
import remote from '@electron/remote';
import { MenuInfo } from 'rc-menu/lib/interface';
import * as pages from './settings/pages';
import { ESettingsCategory } from 'services/settings';
import { EDismissable } from 'services/dismissables';
import { Services } from 'components-react/service-provider';
import { useRealmObject } from 'components-react/hooks/realm';
import { useVuex } from 'components-react/hooks';
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
  highlightSearch: (searchString: string) => void;
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

  const settingsContent = useRef<HTMLDivElement>(null);

  const currentTab = useRealmObject(NavigationService.state).currentSettingsTab;

  const { isPrime, isLoggedIn, username, platform, categories, showDismissable } = useVuex(() => ({
    isPrime: UserService.views.isPrime,
    isLoggedIn: UserService.views.isLoggedIn,
    username: UserService.views.username,
    platform: UserService.views.platform?.type,
    categories: SettingsService.views.categories,
    showDismissable: (value: EDismissable) => DismissablesService.views.shouldShow(value),
  }));

  useEffect(() => {
    // Make sure we have the latest settings
    SettingsService.actions.loadSettingsIntoStore();
  }, []);

  useEffect(() => {
    if (settingsContent.current) {
      settingsContent.current.scrollTop = 0;
    }
  }, [currentTab]);

  function setCurrentTab(value: ESettingsCategory) {
    NavigationService.actions.setSettingsNavigation(value);
  }

  function handleMenuNavigation(event: MenuInfo) {
    setCurrentTab(event.key as ESettingsCategory);
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

  function dismiss(category: ESettingsCategory) {
    const dismissable = SETTINGS_CONFIG[category].dismissable;
    if (dismissable) DismissablesService.actions.dismiss(dismissable);
  }

  /** PAGE SEARCH LOGIC */
  const originalTab = useRef<ESettingsCategory | null>(null);
  const scanning = useRef(false);
  const [searchStr, setSearchStr] = useState('');
  const [searchResultPages, setSearchResultPages] = useState<ESettingsCategory[]>([]);

  function handleSearchCompleted(foundPages: ESettingsCategory[]) {
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

  function onSearchInput(str: string) {
    if (!scanning.current) {
      setSearchStr(str);
      scanning.current = true;
    } else {
      debounce(() => {
        setSearchStr(str);
        scanning.current = false;
      }, 300);
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

  const SettingsContent = SETTINGS_CONFIG[currentTab].component;

  return (
    <ModalLayout>
      <Menu mode="vertical" selectedKeys={[currentTab]} onClick={handleMenuNavigation}>
        <Scrollable>
          <TextInput
            prefix={<i className="icon-search" />}
            placeholder={$t('Search')}
            value={searchStr}
            onChange={onSearchInput}
            uncontrolled={false}
            nowrap
          />
          {categories.map(cat => {
            const config = SETTINGS_CONFIG[cat];
            return (
              <Menu.Item key={cat} icon={<i className={config.icon} />}>
                <div style={{ display: 'flex' }} onClick={() => dismiss(cat)}>
                  {$t(cat)}
                  {config.dismissable && showDismissable(config.dismissable) && (
                    <DismissableBadge dismissableKey={config.dismissable} />
                  )}
                </div>
              </Menu.Item>
            );
          })}
          <div className={styles.settingsAuth} onClick={handleAuth}>
            <i className={isLoggedIn ? 'fas fa-sign-out-alt' : 'fas fa-sign-in-alt'} />
            <strong>{isLoggedIn ? $t('Log Out') : $t('Log In')}</strong>
            {isLoggedIn && platform && <PlatformLogo platform={platform} size="small" />}
            {isLoggedIn && <span>{username}</span>}
          </div>
        </Scrollable>
      </Menu>
      <Scrollable className={styles.settingsContainer}>
        <div ref={settingsContent}>
          <SearchablePages
            onSearchCompleted={handleSearchCompleted}
            pages={categories}
            page={currentTab}
            searchStr={searchStr}
          >
            <SettingsContent highlightSearch={() => {}} globalSearchStr={searchStr} />
          </SearchablePages>
        </div>
      </Scrollable>
    </ModalLayout>
  );
}
