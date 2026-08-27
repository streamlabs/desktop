import { Button, Layout } from 'antd';
import cx from 'classnames';
import { useVuex } from 'components-react/hooks';
import { useRealmObject } from 'components-react/hooks/realm';
import { Services } from 'components-react/service-provider';
import HelpTip from 'components-react/shared/HelpTip';
import Scrollable from 'components-react/shared/Scrollable';
import React, { memo, useCallback, useEffect, useRef } from 'react';
import ResizeObserver from 'resize-observer-polyfill';
import { EDismissable } from 'services/dismissables';
import { $t } from 'services/i18n';
import { ENavMenuKey, ENavMenuTools, TNavMenuKey } from 'services/nav-menu';
import FeaturesNav from './FeaturesNav';
import styles from './NavMenu.m.less';
import NavTools from './NavTools';

const { Sider } = Layout;

export default function NavMenu() {
  const { CustomizationService, NavMenuService, WindowsService } = Services;

  const {
    currentMenuItem,
    setCurrentMenuItem,
    isOpen,
    toggleMenuStatus,
    updateStyleBlockers,
    hideStyleBlockers,
  } = useVuex(() => ({
    currentMenuItem: NavMenuService.views.currentMenuItem,
    setCurrentMenuItem: NavMenuService.actions.setCurrentMenuItem,
    isOpen: NavMenuService.views.isOpen,
    toggleMenuStatus: NavMenuService.actions.toggleMenuStatus,
    updateStyleBlockers: WindowsService.actions.updateStyleBlockers,
    hideStyleBlockers: WindowsService.state.main.hideStyleBlockers,
  }));

  const sider = useRef<HTMLDivElement | null>(null);
  const isMounted = useRef(false);
  const lastHeight = useRef(0);
  const isToggling = useRef(false);

  const { leftDock } = useRealmObject(CustomizationService.state);

  const siderMinWidth: number = 50;
  const siderMaxWidth: number = 200;

  useEffect(() => {
    isMounted.current = true;
    if (!sider?.current) return;

    // We need to ignore resizeObserver entries for vertical resizing
    const resizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]) => {
      entries.forEach((entry: ResizeObserverEntry) => {
        const width = Math.floor(entry?.contentRect?.width);
        const height = Math.floor(entry?.contentRect?.height);

        if (lastHeight.current === height && (width === siderMinWidth || width === siderMaxWidth)) {
          updateStyleBlockers('main', false);
          isToggling.current = false;
        }
        lastHeight.current = height;
      });
    });

    resizeObserver.observe(sider.current);

    if (hideStyleBlockers) {
      updateStyleBlockers('main', false);
    }

    return () => {
      resizeObserver.disconnect();
      isMounted.current = false;
    };
  }, [sider]);

  const updateSubMenu = useCallback(() => {
    // when opening/closing the navbar swap the submenu current menu item
    // to correctly display selected color
    const subMenuItems = {
      [ENavMenuKey.Themes]: ENavMenuTools.Scene,
      [ENavMenuKey.Scene]: ENavMenuKey.Themes,
      [ENavMenuKey.AppStore]: ENavMenuTools.AppsStoreHome,
      [ENavMenuKey.AppsStoreHome]: ENavMenuKey.AppStore,
    };
    if (Object.keys(subMenuItems).includes(currentMenuItem as TNavMenuKey)) {
      // TODO: index
      // @ts-ignore
      setCurrentMenuItem(subMenuItems[currentMenuItem]);
    }
  }, [currentMenuItem]);

  const handleToggle = useCallback(() => {
    if (isToggling.current) return;
    isToggling.current = true;
    updateSubMenu();
    toggleMenuStatus();
    updateStyleBlockers('main', true);
  }, [updateSubMenu, toggleMenuStatus, updateStyleBlockers]);

  return (
    <Layout hasSider className="nav-menu">
      <Sider
        collapsible
        collapsed={!isOpen}
        trigger={null}
        className={cx(
          styles.navMenuSider,
          !isOpen && styles.siderClosed,
          !leftDock && styles.noLeftDock,
        )}
        ref={sider}
      >
        <Scrollable className={cx(styles.navMenuScroll)}>
          {/* top navigation menu */}
          <FeaturesNav />

          {/* bottom navigation menu */}
          <NavTools />
        </Scrollable>

        <LoginHelpTip />
      </Sider>

      {/* this button toggles the menu open and close */}
      <Button
        type="primary"
        className={cx(
          styles.navMenuButton,
          !isOpen && styles.flipped,
          isOpen && styles.siderOpen,
          leftDock && styles.leftDock,
        )}
        onClick={handleToggle}
      >
        <i className="icon-back" />
      </Button>
    </Layout>
  );
}

const LoginHelpTip = memo(function LoginHelpTip() {
  return (
    <HelpTip
      title={$t('Login')}
      dismissableKey={EDismissable.LoginPrompt}
      position={{ top: 'calc(100vh - 175px)', left: '80px' }}
      arrowPosition="bottom"
      style={{ position: 'absolute' }}
    >
      <div>
        {$t(
          'Gain access to additional features by logging in with your preferred streaming platform.',
        )}
      </div>
    </HelpTip>
  );
});
