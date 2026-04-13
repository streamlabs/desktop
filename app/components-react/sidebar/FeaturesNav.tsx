import React, { useMemo, useCallback, memo } from 'react';
import {
  ENavName,
  EMenuItemKey,
  IMenuItem,
  IParentMenuItem,
  TExternalLinkType,
  menuTitles,
  compactMenuItemKeys,
  ESubMenuItemKey,
} from 'services/side-nav';
import { $t } from 'services/i18n';
import { EAvailableFeatures } from 'services/incremental-rollout';
import { TAppPage } from 'services/navigation';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { Menu, message } from 'antd';
import styles from './SideNav.m.less';
import SubMenu from 'components-react/shared/SubMenu';
import MenuItem from 'components-react/shared/MenuItem';
import AppsNav from './AppsNav';
import EditorTabs from './EditorTabs';
import cx from 'classnames';
import Utils from 'services/utils';
import { useRealmObject } from 'components-react/hooks/realm';

export default function FeaturesNav() {
  const toggleStudioMode = useCallback(() => {
    UsageStatisticsService.actions.recordClick('NavTools', 'studio-mode');
    if (TransitionsService.views.studioMode) {
      TransitionsService.actions.disableStudioMode();
    } else {
      TransitionsService.actions.enableStudioMode();
    }
  }, []);

  const navigate = useCallback(
    (page: TAppPage, trackingTarget?: string, type?: TExternalLinkType | string) => {
      if (!UserService.views.isLoggedIn && !loggedOutMenuItemTargets.includes(page)) return;

      if (trackingTarget) {
        // NOTE: For themes, the submenu items are tracked instead of the menu item
        // to distinguish between theme feature usage
        const target = trackingTarget === 'themes' && type ? type : trackingTarget;
        UsageStatisticsService.actions.recordClick('SideNav2', target);
      }

      if (type) {
        NavigationService.actions.navigate(page, { type });
      } else {
        NavigationService.actions.navigate(page);
      }
    },
    [],
  );

  const handleNavigation = useCallback((menuItem: IMenuItem, key?: string) => {
    if (menuItem.key === EMenuItemKey.StudioMode) {
      // if studio mode, toggle studio mode
      toggleStudioMode();
      return;
    } else if (menuItem?.target && menuItem?.type) {
      navigate(menuItem?.target as TAppPage, menuItem?.trackingTarget, menuItem?.type);
    } else if (menuItem?.target) {
      navigate(menuItem?.target as TAppPage, menuItem?.trackingTarget);
    }
    setCurrentMenuItem(key ?? menuItem.key);
  }, []);

  const isParentMenuItem = useCallback((menuItem: IMenuItem): menuItem is IParentMenuItem => {
    return menuItem.hasOwnProperty('subMenuItems');
  }, []);

  const {
    IncrementalRolloutService,
    HighlighterService,
    NavigationService,
    SideNavService,
    TransitionsService,
    UsageStatisticsService,
    UserService,
    VisionService,
  } = Services;

  const isVisionRunning = useRealmObject(VisionService.state).isRunning;

  const {
    featureIsEnabled,
    currentMenuItem,
    setCurrentMenuItem,
    loggedIn,
    menu,
    compactView,
    isOpen,
    openMenuItems,
    expandMenuItem,
    studioMode,
    showCustomEditor,
    loggedOutMenuItemKeys,
    loggedOutMenuItemTargets,
  } = useVuex(() => ({
    featureIsEnabled: (feature: EAvailableFeatures) =>
      IncrementalRolloutService.views.featureIsEnabled(feature),
    currentMenuItem: SideNavService.views.currentMenuItem,
    setCurrentMenuItem: SideNavService.actions.setCurrentMenuItem,
    loggedIn: UserService.views.isLoggedIn,
    menu: SideNavService.state[ENavName.TopNav],
    compactView: SideNavService.views.compactView,
    isOpen: SideNavService.views.isOpen,
    openMenuItems: SideNavService.views.getExpandedMenuItems(ENavName.TopNav),
    expandMenuItem: SideNavService.actions.expandMenuItem,
    studioMode: TransitionsService.views.studioMode,
    showCustomEditor: SideNavService.views.showCustomEditor,
    loggedOutMenuItemKeys: SideNavService.views.loggedOutMenuItemKeys,
    loggedOutMenuItemTargets: SideNavService.views.loggedOutMenuItemTargets,
  }));

  /**
   * Theme audit will only ever be enabled on individual accounts,
   * or enabled via command line flag. Not for general use.
   */
  const themeAuditEnabled = featureIsEnabled(EAvailableFeatures.themeAudit);

  const menuItems = useMemo(
    () =>
      menu.menuItems.filter(menuItem => {
        if (!menuItem.isActive && menuItem.key !== EMenuItemKey.Editor) {
          return false;
        }
        if (!loggedIn && !loggedOutMenuItemKeys.has(menuItem.key)) {
          return false;
        }
        if (menuItem.key === EMenuItemKey.AI && !VisionService.isSupportedForOs()) {
          return false;
        }
        if (menuItem.key === EMenuItemKey.ThemeAudit && !themeAuditEnabled) {
          return false;
        }
        if (compactView && !compactMenuItemKeys.has(menuItem.key)) {
          return false;
        }
        return true;
      }),
    [menu, loggedIn, compactView],
  );

  const menuBadges = useMemo(
    (): Partial<Record<EMenuItemKey | ESubMenuItemKey, string | undefined>> => ({
      [EMenuItemKey.Highlighter]: (() => {
        if (HighlighterService.aiHighlighterFeatureEnabled) {
          const env = Utils.getHighlighterEnvironment();
          return env === 'production' ? 'beta' : env;
        }
      })(),
    }),
    [],
  );

  const menuStyles = useMemo(
    (): Partial<Record<EMenuItemKey | ESubMenuItemKey, any>> => ({
      [EMenuItemKey.AI]: isVisionRunning && styles.ultra,
      [EMenuItemKey.StudioMode]: studioMode && styles.active,
    }),
    [isVisionRunning, studioMode],
  );

  const layoutEditorItem = useMemo(() => {
    return menu.menuItems.find(menuItem => menuItem.key === EMenuItemKey.LayoutEditor);
  }, []);

  const studioModeItem = useMemo(() => {
    return menu.menuItems.find(menuItem => menuItem.key === EMenuItemKey.StudioMode);
  }, []);

  return (
    <Menu
      key={ENavName.TopNav}
      forceSubMenuRender
      mode="inline"
      className={cx(
        styles.topNav,
        isOpen && styles.open,
        !isOpen && styles.siderClosed && styles.closed,
      )}
      defaultOpenKeys={openMenuItems && openMenuItems}
      defaultSelectedKeys={[EMenuItemKey.Editor]}
      getPopupContainer={triggerNode => triggerNode}
    >
      {menuItems.map(menuItem => {
        if (menuItem.key === EMenuItemKey.Editor && loggedIn) {
          // if there are multiple editor screens and the menu is closed, show them in the sidebar
          // if there are multiple editor screens and the menu is open, show them in a submenu
          if (showCustomEditor && !isOpen && !compactView) {
            return <EditorTabs key="editor-tabs" />;
          } else {
            return (
              <SubMenu
                key={menuItem.key}
                title={menuTitles(menuItem.key)}
                icon={menuItem?.icon && <i className={menuItem.icon} />}
                onTitleClick={() => {
                  !isOpen && handleNavigation(menuItem, menuItem.key);
                  expandMenuItem(ENavName.TopNav, menuItem.key as EMenuItemKey);
                }}
                className={cx(
                  !isOpen && styles.closed,
                  !isOpen &&
                    (currentMenuItem === menuItem.key || currentMenuItem === 'sub-default') &&
                    styles.active,
                )}
              >
                <EditorTabs type="submenu" />
                {layoutEditorItem && (
                  <FeaturesNavItem
                    key={layoutEditorItem.key}
                    isSubMenuItem={true}
                    menuItem={layoutEditorItem}
                    handleNavigation={handleNavigation}
                  />
                )}
                {studioModeItem && (
                  <FeaturesNavItem
                    key={studioModeItem.key}
                    isSubMenuItem={true}
                    menuItem={studioModeItem}
                    handleNavigation={handleNavigation}
                    className={cx(menuStyles[studioModeItem.key])}
                  />
                )}
              </SubMenu>
            );
          }
        } else if (isParentMenuItem(menuItem)) {
          return (
            <SubMenu
              key={menuItem.key}
              title={menuTitles(menuItem.key)}
              icon={menuItem?.icon && <i className={menuItem.icon} />}
              onTitleClick={() => {
                menuItem?.subMenuItems[0]?.target &&
                  !isOpen &&
                  handleNavigation(menuItem?.subMenuItems[0], menuItem.key);
                expandMenuItem(ENavName.TopNav, menuItem.key as EMenuItemKey);
              }}
              className={cx(
                !isOpen && styles.closed,
                currentMenuItem === menuItem.key && styles.active,
              )}
            >
              {menuItem?.subMenuItems?.map((subMenuItem: IMenuItem) => (
                <FeaturesNavItem
                  key={subMenuItem.key}
                  isSubMenuItem={true}
                  menuItem={subMenuItem}
                  badge={menuBadges[subMenuItem.key]}
                  className={cx(menuStyles[subMenuItem.key])}
                  handleNavigation={handleNavigation}
                />
              ))}

              {/* handle show apps in the submenu */}
              {menuItem.key === EMenuItemKey.AppStore && <AppsNav type="enabled" />}
            </SubMenu>
          );
        } else {
          // otherwise, display menu item

          const isHidden =
            isOpen &&
            (menuItem.key === EMenuItemKey.LayoutEditor ||
              menuItem.key === EMenuItemKey.StudioMode);

          return (
            !isHidden && (
              <FeaturesNavItem
                key={menuItem.key}
                menuItem={menuItem}
                badge={menuBadges[menuItem.key]}
                className={cx(menuStyles[menuItem.key])}
                handleNavigation={handleNavigation}
              />
            )
          );
        }
      })}

      {loggedIn && !compactView && (
        // apps shown in sidebar
        <AppsNav />
      )}
    </Menu>
  );
}

const FeaturesNavItem = memo(
  (p: {
    isSubMenuItem?: boolean;
    menuItem: IMenuItem | IParentMenuItem;
    handleNavigation: (menuItem: IMenuItem, key?: string) => void;
    badge?: string;
    className?: string;
  }) => {
    const { SideNavService, TransitionsService, DualOutputService } = Services;
    const { isSubMenuItem, menuItem, badge, handleNavigation, className } = p;

    const { currentMenuItem, isOpen, studioMode, dualOutputMode, showBothDisplays } = useVuex(
      () => ({
        currentMenuItem: SideNavService.views.currentMenuItem,
        isOpen: SideNavService.views.isOpen,
        studioMode: TransitionsService.views.studioMode,
        dualOutputMode: DualOutputService.views.dualOutputMode,
        showBothDisplays: DualOutputService.views.showBothDisplays,
      }),
    );

    const title = useMemo(() => menuTitles(menuItem.key), [menuItem]);

    const disabled = useMemo(() => {
      return (
        (menuItem.key === EMenuItemKey.StudioMode && dualOutputMode) ||
        (menuItem.key === EMenuItemKey.StudioMode && showBothDisplays)
      );
    }, [menuItem, dualOutputMode, showBothDisplays]);

    const handleClick = useCallback(() => {
      if (disabled) {
        message.error({
          content: $t('Cannot toggle Studio Mode in Dual Output Mode.'),
          className: styles.toggleError,
        });
      } else {
        handleNavigation(menuItem);
      }
    }, [disabled, handleNavigation, menuItem]);

    return (
      <MenuItem
        className={cx(
          className,
          !isSubMenuItem && !isOpen && styles.closed,
          !isSubMenuItem &&
            menuItem.key === EMenuItemKey.StudioMode &&
            studioMode &&
            styles.studioMode,
          currentMenuItem === menuItem.key && styles.active,
        )}
        title={title}
        icon={menuItem?.icon ? <i className={menuItem?.icon} /> : undefined}
        onClick={handleClick}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {title}
          {badge && (
            <div className={styles.betaTag}>
              <p style={{ margin: 0 }}>{badge}</p>
            </div>
          )}
        </div>
      </MenuItem>
    );
  },
);
