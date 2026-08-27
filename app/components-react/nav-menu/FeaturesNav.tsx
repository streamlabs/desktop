import * as remote from '@electron/remote';
import cx from 'classnames';
import { ClassValue } from 'classnames/types';
import { useVuex } from 'components-react/hooks';
import { useRealmObject } from 'components-react/hooks/realm';
import { Services } from 'components-react/service-provider';
import MenuItem from 'components-react/shared/MenuItem';
import throttle from 'lodash/throttle';
import React, { memo, useCallback, useMemo } from 'react';
import { ENavMenuKey, TExternalLinkType, TNavMenuItem } from 'services/nav-menu';
import { TAppPage } from 'services/navigation';
import styles from './FeaturesNav.m.less';

/** Types that open an external dashboard link rather than an in-app page */
const DASHBOARD_LINK_TYPES = new Set([
  'cloudbot',
  'alertbox',
  'widgets',
  'tipping/methods',
  'multistream',
]);

/**
 * Returns a fragment of feature nav items to be rendered inside a parent
 * <Menu mode="horizontal">. Called as a hook from NavMenu so that rc-menu's
 * overflow measurement sees individual items rather than an opaque component.
 */
export function useFeaturesNav() {
  const {
    MagicLinkService,
    NavigationService,
    NavMenuService,
    UsageStatisticsService,
    UserService,
    VisionService,
  } = Services;

  const { isEnabled: isVisionEnabled } = useRealmObject(VisionService.enabledState);

  const { setCurrentMenuItem, loggedOutMenuItemTargets, menuItems } = useVuex(() => ({
    setCurrentMenuItem: NavMenuService.actions.setCurrentMenuItem,
    loggedOutMenuItemTargets: NavMenuService.views.loggedOutMenuItemTargets,
    menuItems: NavMenuService.menuItems,
  }));

  const menuStyles = useMemo(
    (): Partial<Record<ENavMenuKey, ClassValue>> => ({
      [ENavMenuKey.AI]: isVisionEnabled && styles.ultra,
    }),
    [isVisionEnabled],
  );

  const navigate = useCallback(
    (page: TAppPage, trackingTarget?: string, type?: TExternalLinkType | string) => {
      if (!UserService.views.isLoggedIn && !loggedOutMenuItemTargets.has(page)) return;

      if (trackingTarget) {
        const target = trackingTarget === 'themes' && type ? type : trackingTarget;
        UsageStatisticsService.actions.recordClick('NavMenu', target);
      }

      if (type) {
        NavigationService.actions.navigate(page, { type });
      } else {
        NavigationService.actions.navigate(page);
      }
    },
    [],
  );

  const openDashboard = useMemo(
    () =>
      throttle(
        async (type: string) => {
          UsageStatisticsService.actions.recordClick('NavMenu', type);
          try {
            const link = await MagicLinkService.getDashboardMagicLink(type);
            remote.shell.openExternal(link);
          } catch (e: unknown) {
            console.error('Error generating dashboard magic link', e);
          }
        },
        2000,
        { trailing: false },
      ),
    [],
  );

  const handleNavigation = useCallback((menuItem: TNavMenuItem, key?: ENavMenuKey) => {
    if (menuItem.target === 'Ultra') {
      UsageStatisticsService.actions.recordClick('NavMenu', 'ultra');
      MagicLinkService.actions.linkToPrime('slobs-nav-menu');
      return;
    }
    if (menuItem.type && DASHBOARD_LINK_TYPES.has(menuItem.type)) {
      if (!UserService.views.isLoggedIn) return;
      openDashboard(menuItem.type);
      return;
    }
    if (menuItem?.target && menuItem?.type) {
      navigate(menuItem?.target as TAppPage, menuItem?.trackingTarget, menuItem?.type);
    } else if (menuItem?.target) {
      navigate(menuItem?.target as TAppPage, menuItem?.trackingTarget);
    }
    setCurrentMenuItem(key ?? menuItem.key);
  }, []);

  return (
    <>
      {menuItems.map(menuItem => (
        <FeaturesNavItem
          key={menuItem.key}
          menuItem={menuItem}
          className={cx(menuStyles[menuItem.key])}
          handleNavigation={handleNavigation}
        />
      ))}
    </>
  );
}

const FeaturesNavItem = memo(
  (p: {
    menuItem: TNavMenuItem;
    className?: string;
    handleNavigation: (menuItem: TNavMenuItem, key?: ENavMenuKey) => void;
  }) => {
    const { NavMenuService } = Services;
    const { menuItem, handleNavigation, className } = p;

    const { currentMenuItem } = useVuex(() => ({
      currentMenuItem: NavMenuService.views.currentMenuItem,
    }));

    const handleClick = useCallback(() => handleNavigation(menuItem), [handleNavigation, menuItem]);

    return (
      <MenuItem
        wrapperClassName={cx(styles.featuresNav)}
        className={cx(className, currentMenuItem === menuItem.key && styles.active)}
        title={menuItem.title}
        icon={menuItem?.icon ? <i className={menuItem?.icon} /> : undefined}
        onClick={handleClick}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {menuItem.title}
          {menuItem.badge && (
            <div className={styles.badge}>
              <p style={{ margin: 0 }}>{menuItem.badge}</p>
            </div>
          )}
        </div>
      </MenuItem>
    );
  },
);
