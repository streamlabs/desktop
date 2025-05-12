import React, { useEffect, useRef } from 'react';
import ResizeObserver from 'resize-observer-polyfill';
import cx from 'classnames';
import { EMenuItemKey, ESubMenuItemKey } from 'services/side-nav';
import { EDismissable } from 'services/dismissables';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import NavTools from './NavTools';
import styles from './SideNav.m.less';
import { Layout, Button } from 'antd';
import Scrollable from 'components-react/shared/Scrollable';
import HelpTip from 'components-react/shared/HelpTip';
import FeaturesNav from './FeaturesNav';

const { Sider } = Layout;

export default function SideNav() {
  const { CustomizationService, SideNavService, WindowsService } = Services;

  function updateSubMenu() {
    // when opening/closing the navbar swap the submenu current menu item
    // to correctly display selected color
    const subMenuItems = {
      [EMenuItemKey.Themes]: ESubMenuItemKey.Scene,
      [ESubMenuItemKey.Scene]: EMenuItemKey.Themes,
      [EMenuItemKey.AppStore]: ESubMenuItemKey.AppsStoreHome,
      [ESubMenuItemKey.AppsStoreHome]: EMenuItemKey.AppStore,
    };
    if (Object.keys(subMenuItems).includes(currentMenuItem as EMenuItemKey)) {
      setCurrentMenuItem(subMenuItems[currentMenuItem]);
    }
  }

  const {
    currentMenuItem,
    setCurrentMenuItem,
    leftDock,
    isOpen,
    toggleMenuStatus,
    updateStyleBlockers,
  } = useVuex(() => ({
    currentMenuItem: SideNavService.views.currentMenuItem,
    setCurrentMenuItem: SideNavService.actions.setCurrentMenuItem,
    leftDock: CustomizationService.state.leftDock,
    isOpen: SideNavService.views.isOpen,
    toggleMenuStatus: SideNavService.actions.toggleMenuStatus,
    updateStyleBlockers: WindowsService.actions.updateStyleBlockers,
  }));

  const sider = useRef<HTMLDivElement | null>(null);

  const siderMinWidth: number = 50;
  const siderMaxWidth: number = 200;

  // We need to ignore resizeObserver entries for vertical resizing
  let lastHeight = 0;

  const resizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]) => {
    entries.forEach((entry: ResizeObserverEntry) => {
      const width = Math.floor(entry?.contentRect?.width);
      const height = Math.floor(entry?.contentRect?.height);

      if (lastHeight === height && (width === siderMinWidth || width === siderMaxWidth)) {
        updateStyleBlockers('main', false);
      }
      lastHeight = height;
    });
  });

  useEffect(() => {
    let mounted = true;
    if (sider && sider?.current) {
      resizeObserver.observe(sider?.current);
    }

    return () => {
      if (!sider || !sider?.current) return;
      resizeObserver.unobserve(sider.current);
      mounted = false;
    };
  }, [sider]);

  return (
    <Layout hasSider className="side-nav">
      <Sider
        collapsible
        collapsed={!isOpen}
        trigger={null}
        className={cx(
          styles.sidenavSider,
          !isOpen && styles.siderClosed,
          !leftDock && styles.noLeftDock,
        )}
        ref={sider}
      >
        <Scrollable className={cx(styles.sidenavScroll)}>
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
          styles.sidenavButton,
          !isOpen && styles.flipped,
          isOpen && styles.siderOpen,
          leftDock && styles.leftDock,
        )}
        onClick={() => {
          updateSubMenu();
          toggleMenuStatus();
          updateStyleBlockers('main', true); // hide style blockers
        }}
      >
        <i className="icon-back" />
      </Button>
    </Layout>
  );
}

function LoginHelpTip() {
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
}
