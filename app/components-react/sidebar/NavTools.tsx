import React, { useMemo, useState, useCallback } from 'react';
import cx from 'classnames';
import electron from 'electron';
import Utils from 'services/utils';
import { $t } from 'services/i18n';
import throttle from 'lodash/throttle';
import { Services } from '../service-provider';
import { useVuex } from '../hooks';
import styles from './NavTools.m.less';
import * as remote from '@electron/remote';
import { Badge, Menu } from 'antd';
import { EMenuItemKey, ENavName, IMenuItem, IParentMenuItem, menuTitles } from 'services/side-nav';
import SubMenu from 'components-react/shared/SubMenu';
import MenuItem from 'components-react/shared/MenuItem';
import UltraIcon from 'components-react/shared/UltraIcon';
import PlatformIndicator from './PlatformIndicator';
import { AuthModal } from 'components-react/shared/AuthModal';
import { useRealmObject } from 'components-react/hooks/realm';
import { ESettingsCategory, TCategoryName } from 'services/settings';
import { getOS, OS } from 'util/operating-systems';

export default function SideNav() {
  const {
    UserService,
    SettingsService,
    MagicLinkService,
    UsageStatisticsService,
    SideNavService,
    WindowsService,
    UrlService,
    VisionService,
  } = Services;

  const visionState = useRealmObject(VisionService.state);

  const isDevMode = useMemo(() => Utils.isDevMode(), []);

  const showAiTab = useMemo(() => {
    return getOS() === OS.Windows || (getOS() === OS.Mac && isDevMode);
  }, [isDevMode]);

  const {
    isLoggedIn,
    isPrime,
    menuItems,
    isOpen,
    openMenuItems,
    expandMenuItem,
    updateStyleBlockers,
  } = useVuex(
    () => ({
      isLoggedIn: UserService.views.isLoggedIn,
      isPrime: UserService.views.isPrime,
      menuItems: SideNavService.views.state[ENavName.BottomNav].menuItems,
      isOpen: SideNavService.views.isOpen,
      openMenuItems: SideNavService.views.getExpandedMenuItems(ENavName.BottomNav),
      expandMenuItem: SideNavService.actions.expandMenuItem,
      updateStyleBlockers: WindowsService.actions.updateStyleBlockers,
    }),
    false,
  );

  const [dashboardOpening, setDashboardOpening] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const openSettingsWindow = useCallback((category?: TCategoryName) => {
    SettingsService.actions.showSettings(category);
  }, []);

  const openDevTools = useCallback(() => {
    electron.ipcRenderer.send('openDevTools');
  }, []);

  const openDashboard = useCallback(
    async (page?: string) => {
      UsageStatisticsService.actions.recordClick('SideNav2', page || 'dashboard');
      if (dashboardOpening) return;
      setDashboardOpening(true);

      try {
        const link = await MagicLinkService.getDashboardMagicLink(page);
        remote.shell.openExternal(link);
      } catch (e: unknown) {
        console.error('Error generating dashboard magic link', e);
      }

      setDashboardOpening(false);
    },
    [dashboardOpening],
  );

  const throttledOpenDashboard = throttle(openDashboard, 2000, { trailing: false });

  const openHelp = useCallback(() => {
    UsageStatisticsService.actions.recordClick('SideNav2', 'help');
    remote.shell.openExternal(UrlService.supportLink);
  }, []);

  const upgradeToPrime = useCallback(async () => {
    UsageStatisticsService.actions.recordClick('SideNav2', 'prime');
    MagicLinkService.linkToPrime('slobs-side-nav');
  }, []);

  const handleAuth = useCallback(() => {
    if (isLoggedIn) {
      Services.DualOutputService.actions.setDualOutputModeIfPossible(false, true);
      UserService.actions.logOut();
    } else {
      WindowsService.actions.closeChildWindow();
      UserService.actions.showLogin();
    }
  }, [isLoggedIn]);

  const handleShowModal = useCallback((status: boolean) => {
    setShowModal(status);
    updateStyleBlockers('main', status);
  }, []);

  return (
    <>
      <Menu
        key={ENavName.BottomNav}
        forceSubMenuRender
        mode="inline"
        className={cx(styles.bottomNav, !isOpen && styles.closed, isOpen && styles.open)}
        defaultOpenKeys={openMenuItems && openMenuItems}
        getPopupContainer={triggerNode => triggerNode}
      >
        {menuItems.map((menuItem: IParentMenuItem) => {
          if (isDevMode && menuItem.key === EMenuItemKey.DevTools) {
            return <NavToolsItem key={menuItem.key} menuItem={menuItem} onClick={openDevTools} />;
          } else if (!isPrime && menuItem.key === EMenuItemKey.GetPrime) {
            return (
              <NavToolsItem
                key={menuItem.key}
                menuItem={menuItem}
                icon={
                  <div>
                    <Badge count={<i className={cx('icon-pop-out-3', styles.linkBadge)} />}>
                      <UltraIcon />
                    </Badge>
                  </div>
                }
                onClick={upgradeToPrime}
                className={styles.badgeScale}
              />
            );
          } else if (isLoggedIn && menuItem.key === EMenuItemKey.Dashboard) {
            return (
              <SubMenu
                key={menuItem.key}
                title={menuTitles(menuItem.key)}
                icon={
                  <div>
                    <Badge count={<i className={cx('icon-pop-out-3', styles.linkBadge)} />}>
                      <i className={cx(menuItem.icon, 'small')} />
                    </Badge>
                  </div>
                }
                onTitleClick={() => {
                  !isOpen && throttledOpenDashboard();
                  expandMenuItem(ENavName.BottomNav, menuItem.key as EMenuItemKey);
                }}
              >
                <DashboardSubMenu
                  subMenuItems={menuItem?.subMenuItems}
                  throttledOpenDashboard={throttledOpenDashboard}
                  openSettingsWindow={openSettingsWindow}
                />
              </SubMenu>
            );
          } else if (menuItem.key === EMenuItemKey.GetHelp) {
            return (
              <NavToolsItem
                key={menuItem.key}
                menuItem={menuItem}
                icon={
                  <div>
                    <Badge count={<i className={cx('icon-pop-out-3', styles.linkBadge)} />}>
                      <i className={menuItem?.icon} />
                    </Badge>
                  </div>
                }
                onClick={() => openHelp()}
              />
            );
          } else if (showAiTab && menuItem.key === EMenuItemKey.AI) {
            return (
              <NavToolsItem
                key={menuItem.key}
                menuItem={menuItem}
                className={visionState.isRunning ? styles.vision : undefined}
                onClick={() => openSettingsWindow(ESettingsCategory.AI)}
              />
            );
          } else if (menuItem.key === EMenuItemKey.Settings) {
            return (
              <NavToolsItem
                key={menuItem.key}
                menuItem={menuItem}
                onClick={() => openSettingsWindow()}
              />
            );
          } else if (menuItem.key === EMenuItemKey.Login) {
            return (
              <LoginMenuItem
                key={menuItem.key}
                menuItem={menuItem}
                handleAuth={handleAuth}
                handleShowModal={handleShowModal}
              />
            );
          }
        })}
      </Menu>
      <AuthModal
        title={$t('Confirm')}
        showModal={showModal}
        handleAuth={handleAuth}
        handleShowModal={handleShowModal}
      />
    </>
  );
}

function NavToolsItem(p: {
  menuItem: IMenuItem;
  icon?: React.ReactElement;
  className?: string;
  onClick: () => void;
}) {
  const { menuItem, icon, className, onClick } = p;
  const title = useMemo(() => {
    return menuTitles(menuItem.key);
  }, [menuItem]);
  return (
    <MenuItem
      title={title}
      icon={icon ?? <i className={menuItem?.icon} />}
      className={className}
      onClick={onClick}
    >
      {title}
    </MenuItem>
  );
}

function DashboardSubMenu(p: {
  subMenuItems: IMenuItem[];
  throttledOpenDashboard: (type?: string) => void;
  openSettingsWindow: (category?: TCategoryName) => void;
}) {
  const { subMenuItems, throttledOpenDashboard, openSettingsWindow } = p;

  function handleNavigation(type?: string) {
    if (type === 'multistream') {
      openSettingsWindow('Multistreaming');
    } else {
      throttledOpenDashboard(type);
    }
  }
  return (
    <>
      {subMenuItems.map((subMenuItem: IMenuItem) => (
        <MenuItem
          key={subMenuItem.key}
          title={menuTitles(subMenuItem.key)}
          onClick={() => handleNavigation(subMenuItem?.type)}
        >
          {menuTitles(subMenuItem.key)}
        </MenuItem>
      ))}
    </>
  );
}

function LoginMenuItem(p: {
  menuItem: IMenuItem;
  handleAuth: () => void;
  handleShowModal: (status: boolean) => void;
}) {
  const { menuItem, handleAuth, handleShowModal } = p;
  const { UserService, SideNavService } = Services;

  const { isLoggedIn, platform, isOpen } = useVuex(
    () => ({
      isLoggedIn: UserService.views.isLoggedIn,
      platform: UserService.views.auth?.platforms[UserService.views.auth?.primaryPlatform],
      isOpen: SideNavService.views.isOpen,
    }),
    false,
  );

  return (
    <MenuItem
      data-testid="nav-auth"
      title={!isLoggedIn ? menuTitles(menuItem.key) : $t('Log Out')}
      className={cx(styles.login, !isOpen && styles.loginClosed)}
      icon={!isOpen && <i className="icon-user" />}
      onClick={() => (isLoggedIn ? handleShowModal(true) : handleAuth())}
    >
      {!isLoggedIn ? (
        <span className={styles.loggedOut}>{menuTitles(menuItem.key)}</span>
      ) : (
        isOpen && <PlatformIndicator platform={platform} />
      )}
    </MenuItem>
  );
}
