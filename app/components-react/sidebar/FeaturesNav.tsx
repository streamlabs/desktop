import React, { useMemo } from 'react';
import {
  ENavName,
  EMenuItemKey,
  IMenuItem,
  IParentMenuItem,
  TExternalLinkType,
  menuTitles,
  compactMenuItemKeys,
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

export default function FeaturesNav() {
  function toggleStudioMode() {
    UsageStatisticsService.actions.recordClick('NavTools', 'studio-mode');
    if (TransitionsService.views.studioMode) {
      TransitionsService.actions.disableStudioMode();
    } else {
      TransitionsService.actions.enableStudioMode();
    }
  }

  function navigate(page: TAppPage, trackingTarget?: string, type?: TExternalLinkType | string) {
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
  }

  function handleNavigation(menuItem: IMenuItem, key?: string) {
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
  }
  const {
    NavigationService,
    UserService,
    IncrementalRolloutService,
    UsageStatisticsService,
    SideNavService,
    TransitionsService,
  } = Services;

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

  const menuItems = useMemo(() => {
    if (!loggedIn) {
      return menu.menuItems.filter(menuItem =>
        loggedOutMenuItemKeys.includes(menuItem.key as EMenuItemKey),
      );
    }
    return !compactView
      ? menu.menuItems
      : menu.menuItems.filter((menuItem: IMenuItem) => {
          if (compactMenuItemKeys.includes(menuItem.key as EMenuItemKey)) {
            return menuItem;
          }
        });
  }, [compactView, menu, loggedIn]);

  const layoutEditorItem = useMemo(() => {
    return menu.menuItems.find(menuItem => menuItem.key === EMenuItemKey.LayoutEditor);
  }, []);

  const studioModeItem = useMemo(() => {
    return menu.menuItems.find(menuItem => menuItem.key === EMenuItemKey.StudioMode);
  }, []);

  /*
   * Theme audit will only ever be enabled on individual accounts or enabled
   * via command line flag. Not for general use.
   */
  const themeAuditEnabled = featureIsEnabled(EAvailableFeatures.themeAudit);

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
      {menuItems.map((menuItem: IParentMenuItem) => {
        if (
          (menuItem.key !== EMenuItemKey.Editor && !menuItem?.isActive) ||
          (menuItem.key === EMenuItemKey.ThemeAudit && !themeAuditEnabled)
        ) {
          // skip inactive menu items
          // skip legacy menu items for new users
          // skip Theme Audit if not enabled
          return null;
        } else if (menuItem.key === EMenuItemKey.Editor && loggedIn) {
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
                    className={studioMode && styles.active}
                  />
                )}
              </SubMenu>
            );
          }
        } else if (menuItem.hasOwnProperty('subMenuItems')) {
          // display submenu if there are submenu items
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

function FeaturesNavItem(p: {
  isSubMenuItem?: boolean;
  menuItem: IMenuItem | IParentMenuItem;
  handleNavigation: (menuItem: IMenuItem, key?: string) => void;
  className?: string;
}) {
  const {
    SideNavService,
    TransitionsService,
    DualOutputService,
    IncrementalRolloutService,
  } = Services;
  const aiHighlighterFeatureEnabled = IncrementalRolloutService.views.featureIsEnabled(
    EAvailableFeatures.aiHighlighter,
  );
  const { isSubMenuItem, menuItem, handleNavigation, className } = p;

  const { currentMenuItem, isOpen, studioMode, dualOutputMode } = useVuex(() => ({
    currentMenuItem: SideNavService.views.currentMenuItem,
    isOpen: SideNavService.views.isOpen,
    studioMode: TransitionsService.views.studioMode,
    dualOutputMode: DualOutputService.views.dualOutputMode,
  }));

  function setIcon() {
    if (menuItem.key === EMenuItemKey.Highlighter) {
      return <HighlighterIcon />;
    } else if (menuItem?.icon) {
      return <i className={menuItem?.icon} />;
    }
  }

  const title = useMemo(() => {
    return menuTitles(menuItem.key);
  }, [menuItem]);

  const disabled = dualOutputMode && menuItem.key === EMenuItemKey.StudioMode;

  function showErrorMessage() {
    message.error({
      content: $t('Cannot toggle Studio Mode in Dual Output Mode.'),
      className: styles.toggleError,
    });
  }
  const highlighterEnvironment = useMemo(Utils.getHighlighterEnvironment, []);

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
      icon={setIcon()}
      onClick={() => {
        if (disabled) {
          showErrorMessage();
        } else {
          handleNavigation(menuItem);
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {title}
        {menuItem.key === EMenuItemKey.Highlighter && aiHighlighterFeatureEnabled && (
          <div className={styles.betaTag}>
            <p style={{ margin: 0 }}>
              {highlighterEnvironment === 'production' ? 'beta' : highlighterEnvironment}
            </p>
          </div>
        )}
      </div>
    </MenuItem>
  );
}

// TODO: Replace with font icon once updated font is merged
const HighlighterIcon = () => (
  <svg
    width="12px"
    height="12px"
    viewBox="0 0 18 18"
    xmlns="http://www.w3.org/2000/svg"
    className="highlighter"
    style={{ fill: 'var(--paragraph)' }}
  >
    <g clipPath="url(#clip0)">
      <path d="M0.736816 10.4971V16.1241C0.736816 17.1587 1.57862 17.9997 2.61248 17.9997H16.1173C17.152 17.9997 17.993 17.1587 17.993 16.1241V10.4971H0.736816V10.4971Z" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.30361 2.56988L8.88907 1.71484L11.4745 5.15035L7.64504 6.01543L7.64807 6.01989L4.51906 6.75186L2.27539 3.28364L5.30125 2.56641L5.30361 2.56988Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M17.3426 0.851841L17.9811 3.27371C18.0066 3.37275 17.9916 3.47709 17.9391 3.5641C17.8865 3.65111 17.801 3.71339 17.7012 3.7359L14.3855 4.42042L12.2759 4.96974L9.68604 1.52675L10.6496 1.34058L15.9974 0.028045C16.5924 -0.107742 17.1956 0.262868 17.3426 0.851841Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.26681 6.75197L8.26877 6.74707H11.2121L10.0116 9.74741H7.06836L7.06862 9.74676H3.31689L4.51918 6.75212L8.26681 6.75197Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.8198 9.74741L12.0203 6.74707H15.7717H16.5H17.6181C17.8259 6.74707 17.9932 6.91437 17.9933 7.12218V9.74815H14.5713L14.5716 9.74741H10.8198Z"
      />
      <path d="M1.49516 3.4707L0.883682 3.61549C0.585836 3.68302 0.333746 3.86382 0.173938 4.12344C0.014131 4.3838 -0.033136 4.68991 0.0411407 4.98624L0.736641 7.73522V9.74745H2.50877L3.63491 6.87594L1.49516 3.4707Z" />
    </g>
    <defs>
      <clipPath id="clip0">
        <rect width="18" height="18" fill="white" />
      </clipPath>
    </defs>
  </svg>
);
