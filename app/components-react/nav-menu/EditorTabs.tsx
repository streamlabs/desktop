import React, { useMemo } from 'react';
import { Services } from 'components-react/service-provider';
import styles from './NavMenu.m.less';
import MenuItem from 'components-react/shared/MenuItem';
import { useVuex } from 'components-react/hooks';
import cx from 'classnames';
import { ENavMenuKey, ENavName } from 'services/nav-menu';
import { $t } from 'services/i18n';

interface IEditorTabs {
  type?: 'root' | 'submenu';
}

export default function EditorTabs(p: IEditorTabs) {
  const { NavigationService, NavMenuService, LayoutService } = Services;
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
      NavMenuService.views.currentMenuItem === 'editor'
        ? 'default'
        : NavMenuService.views.currentMenuItem,
    setCurrentMenuItem: NavMenuService.actions.setCurrentMenuItem,
    studioTabs: LayoutService.views.studioTabs,
    compactView: NavMenuService.views.compactView,
    isOpen: NavMenuService.views.isOpen,
    showCustomEditor: NavMenuService.views.showCustomEditor,
    toggleSidebarSubmenu: NavMenuService.actions.toggleSidebarSubmenu,
    toggleMenuItem: NavMenuService.actions.toggleMenuItem,
    editorToggled: NavMenuService.views.getMenuItemData(ENavName.FeaturesNav, ENavMenuKey.Editor)
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
        toggleMenuItem(ENavName.FeaturesNav, ENavMenuKey.Editor, true);
      }
    }
  }

  const rootTabs = useMemo(() => {
    return editorToggled ? studioTabs : studioTabs.filter(tab => tab.key !== 'default');
  }, [editorToggled, studioTabs]);

  // if closed, show editor tabs in nav menu when tab is toggled on
  // show all editor tabs in submenu
  // don't translate tab title because the user has set it
  return type === 'root' ? (
    <>
      {rootTabs.map(tab => (
        <MenuItem
          key={tab.key}
          className={cx(
            !isOpen && styles.closed,
            (currentMenuItem === ENavMenuKey.Editor ||
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
