import * as remote from '@electron/remote';
import { Badge, Menu } from 'antd';
import cx from 'classnames';
import { AuthModal } from 'components-react/shared/AuthModal';
import MenuItem from 'components-react/shared/MenuItem';
import SubMenu from 'components-react/shared/SubMenu';
import UltraIcon from 'components-react/shared/UltraIcon';
import electron from 'electron';
import throttle from 'lodash/throttle';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { $t } from 'services/i18n';
import {
  ENavMenuKey,
  ENavName,
  IMenuItem,
  IParentMenuItem,
  menuTitles,
  TNavMenuKey,
} from 'services/nav-menu';
import { ESettingsCategory, TCategoryName } from 'services/settings';
import Utils from 'services/utils';
import { useVuex } from '../hooks';
import { Services } from '../service-provider';
import styles from './NavTools.m.less';
import PlatformIndicator from './PlatformIndicator';

export default memo(function NavTools() {
  const {
    UserService,
    SettingsService,
    MagicLinkService,
    UsageStatisticsService,
    NavMenuService,
    WindowsService,
  } = Services;

  const isDevMode = useMemo(() => Utils.isDevMode(), []);

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
      menuItems: NavMenuService.views.state[ENavName.ToolsNav].menuItems,
      isOpen: NavMenuService.views.isOpen,
      openMenuItems: NavMenuService.views.getExpandedMenuItems(ENavName.ToolsNav),
      expandMenuItem: NavMenuService.actions.expandMenuItem,
      updateStyleBlockers: WindowsService.actions.updateStyleBlockers,
    }),
    false,
  );

  const [dashboardOpening, setDashboardOpening] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const isMounted = useRef(true);

  useEffect(
    () => () => {
      isMounted.current = false;
    },
    [],
  );

  function openSettingsWindow(category?: TCategoryName) {
    SettingsService.actions.showSettings(category);
  }

  function openDevTools() {
    electron.ipcRenderer.send('openDevTools');
  }

  async function openDashboard(page?: string) {
    UsageStatisticsService.actions.recordClick('SideNav2', page || 'dashboard');
    if (dashboardOpening) return;
    setDashboardOpening(true);

    try {
      const link = await MagicLinkService.getDashboardMagicLink(page);
      remote.shell.openExternal(link);
    } catch (e: unknown) {
      console.error('Error generating dashboard magic link', e);
    }

    if (isMounted.current) setDashboardOpening(false);
  }

  const throttledOpenDashboard = throttle(openDashboard, 2000, { trailing: false });

  // Instagram doesn't provide a username, since we're not really linked, pass undefined for a generic logout msg w/o it
  const username =
    isLoggedIn && UserService.views.auth!.primaryPlatform !== 'instagram'
      ? UserService.username
      : undefined;

  const confirmMsg = username
    ? $t('Are you sure you want to log out %{username}?', { username })
    : $t('Are you sure you want to log out?');

  function openHelp() {
    UsageStatisticsService.actions.recordClick('SideNav2', 'help');
    openSettingsWindow(ESettingsCategory.GetSupport);
  }

  async function upgradeToPrime() {
    UsageStatisticsService.actions.recordClick('SideNav2', 'prime');
    MagicLinkService.linkToPrime('slobs-side-nav');
  }

  const handleAuth = () => {
    if (isLoggedIn) {
      Services.DualOutputService.actions.setDualOutputModeIfPossible(false, true);
      UserService.actions.logOut();
    } else {
      WindowsService.actions.closeChildWindow();
      UserService.actions.showLogin();
    }
  };

  const handleShowModal = (status: boolean) => {
    updateStyleBlockers('main', status);
    setShowModal(status);
  };

  return (
    <>
      <Menu
        key={ENavName.ToolsNav}
        forceSubMenuRender
        mode="inline"
        className={cx(styles.bottomNav, !isOpen && styles.closed, isOpen && styles.open)}
        defaultOpenKeys={openMenuItems && openMenuItems}
        getPopupContainer={triggerNode => triggerNode}
      >
        {menuItems.map((menuItem: IParentMenuItem | IMenuItem) => {
          if (isDevMode && menuItem.key === ENavMenuKey.DevTools) {
            <></>;
            return <NavToolsItem key={menuItem.key} menuItem={menuItem} onClick={openDevTools} />;
          } else if (!isPrime && menuItem.key === ENavMenuKey.GetPrime) {
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
          } else if (isLoggedIn && menuItem.key === ENavMenuKey.Dashboard) {
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
                  expandMenuItem(ENavName.ToolsNav, menuItem.key as TNavMenuKey);
                }}
              >
                <DashboardSubMenu
                  subMenuItems={(menuItem as IParentMenuItem)?.subMenuItems}
                  throttledOpenDashboard={throttledOpenDashboard}
                  openSettingsWindow={openSettingsWindow}
                />
              </SubMenu>
            );
          } else if (menuItem.key === ENavMenuKey.GetHelp) {
            return (
              <NavToolsItem key={menuItem.key} menuItem={menuItem} onClick={() => openHelp()} />
            );
          } else if (menuItem.key === ENavMenuKey.Settings) {
            return (
              <NavToolsItem
                key={menuItem.key}
                menuItem={menuItem}
                onClick={() => openSettingsWindow()}
              />
            );
          } else if (menuItem.key === ENavMenuKey.Login) {
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
        prompt={confirmMsg}
        showModal={showModal}
        handleAuth={handleAuth}
        handleShowModal={handleShowModal}
      />
    </>
  );
});

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
  const { UserService, NavMenuService } = Services;

  const { isLoggedIn, platform, isOpen } = useVuex(
    () => ({
      isLoggedIn: UserService.views.isLoggedIn,
      platform: UserService.views.auth?.platforms[UserService.views.auth?.primaryPlatform],
      isOpen: NavMenuService.views.isOpen,
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
