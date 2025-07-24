import React, { useMemo } from 'react';
import { Services } from 'components-react/service-provider';
import styles from './SideNav.m.less';
import MenuItem from 'components-react/shared/MenuItem';
import { useVuex } from 'components-react/hooks';
import cx from 'classnames';
import { EMenuItemKey, ENavName } from 'services/side-nav';
import { $t } from 'services/i18n';

interface IEditorTabs {
  type?: 'root' | 'submenu';
}

export default function EditorTabs(p: IEditorTabs) {
  const { NavigationService, SideNavService, LayoutService } = Services;
  const { type = 'root' } = p;

  const defaultTitle = $t('Editor');
  const {
    currentMenuItem,
    setCurrentMenuItem,
    studioTabs,
    isOpen,
    showCustomEditor,
    toggleSidebarSubmenu,
    toggleMenuItem,
    editorToggled,
  } = useVuex(() => ({
    currentMenuItem:
      SideNavService.views.currentMenuItem === 'editor'
        ? 'default'
        : SideNavService.views.currentMenuItem,
    setCurrentMenuItem: SideNavService.actions.setCurrentMenuItem,
    studioTabs: LayoutService.views.studioTabs,
    compactView: SideNavService.views.compactView,
    isOpen: SideNavService.views.isOpen,
    showCustomEditor: SideNavService.views.showCustomEditor,
    toggleSidebarSubmenu: SideNavService.actions.toggleSidebarSubmenu,
    toggleMenuItem: SideNavService.actions.toggleMenuItem,
    editorToggled: SideNavService.views.getMenuItemData(ENavName.TopNav, EMenuItemKey.Editor)
      ?.isActive,
  }));

  function navigateToStudioTab(tabId: string, trackingTarget: string, key: string) {
    if (currentMenuItem !== key) {
      LayoutService.actions.setCurrentTab(tabId);
      setCurrentMenuItem(key);
      NavigationService.actions.navigate('Studio', { trackingTarget });

      // make sure custom editor setting is toggled on
      // if the active editor screen is not the default editor screen
      if (tabId !== 'default' && !showCustomEditor) {
        toggleSidebarSubmenu(true);
      } else if (tabId === 'default' && !editorToggled && isOpen) {
        toggleMenuItem(ENavName.TopNav, EMenuItemKey.Editor, true);
      }
    }
  }

  const rootTabs = useMemo(() => {
    return editorToggled ? studioTabs : studioTabs.filter(tab => tab.key !== 'default');
  }, [editorToggled, studioTabs]);

  // if closed, show editor tabs in sidenav when tab is toggled on
  // show all editor tabs in submenu
  // don't translate tab title because the user has set it
  return type === 'root' ? (
    <>
      {rootTabs.map(tab => (
        <MenuItem
          key={tab.key}
          className={cx(
            !isOpen && styles.closed,
            (currentMenuItem === EMenuItemKey.Editor ||
              currentMenuItem === tab.key ||
              currentMenuItem === `sub-${tab.key}`) &&
              styles.active,
          )}
          title={tab.title ?? defaultTitle}
          icon={<i className={tab.icon} />}
          onClick={() => navigateToStudioTab(tab.target, tab.trackingTarget, tab.key)}
        >
          {tab.title}
        </MenuItem>
      ))}
    </>
  ) : (
    <>
      {studioTabs.map(tab => (
        <MenuItem
          key={`sub-${tab.key}`}
          className={cx(
            (currentMenuItem === tab.key || currentMenuItem === `sub-${tab.key}`) && styles.active,
          )}
          title={tab?.title ?? defaultTitle}
          icon={<i className={tab.icon} />}
          onClick={() => navigateToStudioTab(tab.target, tab.trackingTarget, `sub-${tab.key}`)}
          type="submenu"
        >
          {tab?.title ?? defaultTitle}
        </MenuItem>
      ))}
    </>
  );
}
