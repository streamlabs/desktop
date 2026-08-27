import * as remote from '@electron/remote';
import { Menu } from 'antd';
import cx from 'classnames';
import { AuthModal } from 'components-react/shared/AuthModal';
import MenuItem from 'components-react/shared/MenuItem';
import electron from 'electron';
import throttle from 'lodash/throttle';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { $t } from 'services/i18n';
import { TNavMenuItem } from 'services/nav-menu';
import { ESettingsCategory, TCategoryName } from 'services/settings';
import Utils from 'services/utils';
import { useVuex } from '../hooks';
import { Services } from '../service-provider';
import styles from './NavTools.m.less';
import PlatformIndicator from './PlatformIndicator';

/**
 * Returns nav tool items (fragment) and any modals that must live outside
 * the <Menu> element. Called as a hook from NavMenu so that rc-menu's overflow
 * measurement sees individual items rather than an opaque component.
 */
export function useNavTools() {
  const {
    UserService,
    SettingsService,
    MagicLinkService,
    UsageStatisticsService,
    NavMenuService,
    WindowsService,
  } = Services;

  const isDevMode = useMemo(() => Utils.isDevMode(), []);

  const { isLoggedIn, isPrime, updateStyleBlockers } = useVuex(
    () => ({
      isLoggedIn: UserService.views.isLoggedIn,
      isPrime: UserService.views.isPrime,
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
    UsageStatisticsService.actions.recordClick('NavMenu', page || 'dashboard');
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
    UsageStatisticsService.actions.recordClick('NavMenu', 'help');
    openSettingsWindow(ESettingsCategory.GetSupport);
  }

  async function upgradeToPrime() {
    UsageStatisticsService.actions.recordClick('NavMenu', 'prime');
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

  const items = (
    <>
      <Menu
        key="tools-nav"
        forceSubMenuRender
        mode="inline"
        className={cx(styles.bottomNav)}
        // defaultOpenKeys={openMenuItems && openMenuItems}
        getPopupContainer={triggerNode => triggerNode}
      >
        {/* {menuItems.map((menuItem: IParentMenuItem | IMenuItem) => { */}
        {/*   if (isDevMode && menuItem.key === EMenuItemKey.DevTools) { */}
        {/*     return <NavToolsItem key={menuItem.key} menuItem={menuItem} onClick={openDevTools} />; */}
        {/*   } else if (!isPrime && menuItem.key === EMenuItemKey.GetPrime) { */}
        {/*     return ( */}
        {/*       <NavToolsItem */}
        {/*         key={menuItem.key} */}
        {/*         menuItem={menuItem} */}
        {/*         icon={ */}
        {/*           <div> */}
        {/*             <Badge count={<i className={cx('icon-pop-out-3', styles.linkBadge)} />}> */}
        {/*               <UltraIcon /> */}
        {/*             </Badge> */}
        {/*           </div> */}
        {/*         } */}
        {/*         onClick={upgradeToPrime} */}
        {/*         className={styles.badgeScale} */}
        {/*       /> */}
        {/*     ); */}
        {/*   } else if (isLoggedIn && menuItem.key === EMenuItemKey.Dashboard) { */}
        {/*     return ( */}
        {/*       <SubMenu */}
        {/*         key={menuItem.key} */}
        {/*         title={menuTitles(menuItem.key)} */}
        {/*         icon={ */}
        {/*           <div> */}
        {/*             <Badge count={<i className={cx('icon-pop-out-3', styles.linkBadge)} />}> */}
        {/*               <i className={cx(menuItem.icon, 'small')} /> */}
        {/*             </Badge> */}
        {/*           </div> */}
        {/*         } */}
        {/*         onTitleClick={() => { */}
        {/*           !isOpen && throttledOpenDashboard(); */}
        {/*           expandMenuItem(ENavName.BottomNav, menuItem.key as EMenuItemKey); */}
        {/*         }} */}
        {/*       > */}
        {/*         <DashboardSubMenu */}
        {/*           subMenuItems={(menuItem as IParentMenuItem)?.subMenuItems} */}
        {/*           throttledOpenDashboard={throttledOpenDashboard} */}
        {/*           openSettingsWindow={openSettingsWindow} */}
        {/*         /> */}
        {/*       </SubMenu> */}
        {/*     ); */}
        {/*   } else if (menuItem.key === EMenuItemKey.GetHelp) { */}
        {/*     return ( */}
        {/*       <NavToolsItem key={menuItem.key} menuItem={menuItem} onClick={() => openHelp()} /> */}
        {/*     ); */}
        {/*   } else if (menuItem.key === EMenuItemKey.Settings) { */}
        {/*     return ( */}
        {/*       <NavToolsItem */}
        {/*         key={menuItem.key} */}
        {/*         menuItem={menuItem} */}
        {/*         onClick={() => openSettingsWindow()} */}
        {/*       /> */}
        {/*     ); */}
        {/*   } else if (menuItem.key === EMenuItemKey.Login) { */}
        {/*     return ( */}
        {/*       <LoginMenuItem */}
        {/*         key={menuItem.key} */}
        {/*         menuItem={menuItem} */}
        {/*         handleAuth={handleAuth} */}
        {/*         handleShowModal={handleShowModal} */}
        {/*       /> */}
        {/*     ); */}
        {/*   } */}
        {/* })} */}
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

  const modals = <>{/* TODO @nav: Add relevant modals */}</>;

  return { items, modals };
}

function NavToolsItem(p: {
  menuItem: TNavMenuItem;
  icon?: React.ReactElement;
  className?: string;
  onClick: () => void;
}) {
  const { menuItem, icon, className, onClick } = p;
  return (
    <MenuItem
      title={menuItem.title}
      icon={icon ?? <i className={menuItem?.icon} />}
      className={className}
      onClick={onClick}
    >
      {menuItem.title}
    </MenuItem>
  );
}

function LoginMenuItem(p: {
  menuItem: TNavMenuItem;
  handleAuth: () => void;
  handleShowModal: (status: boolean) => void;
}) {
  const { menuItem, handleAuth, handleShowModal } = p;
  const { UserService, NavMenuService } = Services;

  const { isLoggedIn, platform } = useVuex(
    () => ({
      isLoggedIn: UserService.views.isLoggedIn,
      platform: UserService.views.auth?.platforms[UserService.views.auth?.primaryPlatform],
    }),
    false,
  );

  return (
    <MenuItem
      data-testid="nav-auth"
      title={!isLoggedIn ? menuItem.title : $t('Log Out')}
      className={cx(styles.login)}
      icon={<i className="icon-user" />}
      onClick={() => (isLoggedIn ? handleShowModal(true) : handleAuth())}
    >
      {!isLoggedIn ? (
        <span className={styles.loggedOut}>{menuItem.title}</span>
      ) : (
        <PlatformIndicator platform={platform} />
      )}
    </MenuItem>
  );
}
