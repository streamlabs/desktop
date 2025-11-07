import React, { useCallback } from 'react';
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
import { useRealmObject } from 'components-react/hooks/realm';

const { Sider } = Layout;

export default function SideNav() {
  const { CustomizationService, SideNavService, WindowsService } = Services;

  const {
    currentMenuItem,
    setCurrentMenuItem,
    isOpen,
    toggleMenuStatus,
    updateStyleBlockers,
  } = useVuex(() => ({
    currentMenuItem: SideNavService.views.currentMenuItem,
    setCurrentMenuItem: SideNavService.actions.setCurrentMenuItem,
    isOpen: SideNavService.views.isOpen,
    toggleMenuStatus: SideNavService.actions.toggleMenuStatus,
    updateStyleBlockers: WindowsService.actions.updateStyleBlockers,
  }));

  const leftDock = useRealmObject(CustomizationService.state).leftDock;

  const updateSubMenu = useCallback(() => {
    // when opening/closing the navbar swap the submenu current menu item
    // to correctly display selected color
    const subMenuItems = {
      [EMenuItemKey.Themes]: ESubMenuItemKey.Scene,
      [ESubMenuItemKey.Scene]: EMenuItemKey.Themes,
      [EMenuItemKey.AppStore]: ESubMenuItemKey.AppsStoreHome,
      [ESubMenuItemKey.AppsStoreHome]: EMenuItemKey.AppStore,
    };
    if (Object.keys(subMenuItems).includes(currentMenuItem as EMenuItemKey)) {
      // TODO: index
      // @ts-ignore
      setCurrentMenuItem(subMenuItems[currentMenuItem]);
    }
  }, [currentMenuItem]);

  const toggleSideNav = useCallback(() => {
    updateStyleBlockers('main', true);
    updateSubMenu();
    toggleMenuStatus();
  }, [isOpen, toggleMenuStatus, updateStyleBlockers, updateSubMenu]);

  return (
    <Layout hasSider className="side-nav">
      <Sider
        collapsible
        collapsed={!isOpen}
        trigger={null}
        collapsedWidth={50}
        className={cx(
          styles.sidenavSider,
          { [styles.siderClosed]: !isOpen },
          { [styles.noLeftDock]: !leftDock },
        )}
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
        onClick={toggleSideNav}
        onTransitionEnd={() => updateStyleBlockers('main', false)}
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
