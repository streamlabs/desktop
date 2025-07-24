import { TAppPage } from 'services/navigation';
import { $t } from 'services/i18n';

/**
 * Update Menu Items
 * 1. EMenuItemKey: Add/update/remove enum in EMenuItemKey.
 * 2. Add string title to menuTitles.
 * 3. Add an entry to SideNavMenuItems. Use the subMenuItems property to add submenu items from SideBarSubMenuItems to the menu item.
 * 4. To show the menu item, add it to either SideBarTopNavData or SideBarBottomNavData.
 * 5. To show a menu item in the top nav to a logged out user, add it to loggedOutMenuItems.
 * 6. To show a menu item in the top nav compact menu, add it to compactMenuItemKeys.
 */
export enum EMenuItemKey {
  Editor = 'editor',
  LayoutEditor = 'layout-editor',
  StudioMode = 'studio-mode',
  Themes = 'themes',
  AppStore = 'app-store',
  Highlighter = 'highlighter',
  RecordingHistory = 'recording-history',
  ThemeAudit = 'theme-audit',
  DevTools = 'dev-tools',
  GetPrime = 'get-prime',
  Dashboard = 'dashboard',
  GetHelp = 'get-help',
  Settings = 'settings',
  Login = 'login',
}

/**
 * Update SubMenu Items
 * 1. ESubMenuItemKey: Add/update/remove enum.
 * 2. Add string title to menuTitles.
 * 3. Add entry to SideBarSubMenuItems.
 * 4. To show the submenu item, add it to a menu item entry in SideNavMenuItems by using the subMenuItems property.
 */
export enum ESubMenuItemKey {
  Scene = 'browse-overlays',
  Widget = 'browse-overlays-widgets',
  Sites = 'browse-overlays-sites',
  Collectibles = 'browse-overlays-collectibles',
  AppsStoreHome = 'platform-app-store-home',
  AppsManager = 'platform-app-store-manager',
  DashboardHome = 'dashboard-home',
  Cloudbot = 'dashboard-cloudbot',
  AlertBoxSettings = 'dashboard-alertbox',
  Widgets = 'dashboard-widgets',
  TipSettings = 'dashboard-tips',
  Multistream = 'dashboard-multistream',
}

export const ESideNavKey = { ...EMenuItemKey, ...ESubMenuItemKey };

/**
 * Update External Links
 * 1. Confirm external link parameter for url.
 * 2. Add/update/remove type in TExternalLinkType. The type is the url parameter.
 */
export type TExternalLinkType =
  | 'overlay'
  | 'widget-theme'
  | 'site-theme'
  | 'cloudbot'
  | 'alertbox'
  | 'widgets'
  | 'tipping/methods'
  | 'multistream';

/**
 * Update Protocal Link Map
 * 1. Confirm protocol link parameter for url.
 * 2. Add/update/remove entry in ProtocolLinkKeyMap. The ket is the url parameter.
 */
export const ProtocolLinkKeyMap = {
  ['overlay']: ESubMenuItemKey.Scene,
  ['widget-theme']: ESubMenuItemKey.Widget,
  ['site-theme']: ESubMenuItemKey.Sites,
};

type TSideNavItem = TAppPage | TExternalLinkType | 'NavTools' | 'WidgetWindow' | string;
export interface IAppMenuItem {
  id: string;
  name?: string;
  isActive: boolean;
  icon?: string;
}
export interface IMenu {
  name: string;
  menuItems: (IMenuItem | IParentMenuItem)[];
}

interface ISideNavItem {
  key: TSideNavItem;
  target?: TSideNavItem; // optional because menu item could be a toggle
}
export interface IMenuItem extends ISideNavItem {
  type?: TExternalLinkType | string;
  trackingTarget?: string;
  icon?: string;
  isExpanded: boolean;
  isActive?: boolean;
}

export interface IParentMenuItem extends IMenuItem {
  isToggled?: boolean;
  subMenuItems: IMenuItem[];
}

export enum ENavName {
  TopNav = 'top-nav',
  BottomNav = 'bottom-nav',
}

export const loggedOutMenuItems: ISideNavItem[] = [
  {
    key: EMenuItemKey.Editor,
    target: 'Studio',
  },
  { key: EMenuItemKey.RecordingHistory, target: 'RecordingHistory' },
];

export const compactMenuItemKeys: EMenuItemKey[] = [
  EMenuItemKey.Editor,
  EMenuItemKey.Themes,
  EMenuItemKey.AppStore,
  EMenuItemKey.Highlighter,
  EMenuItemKey.RecordingHistory,
];

/**
 * The string titles for the menu items and submenu items
 * @param item - key for the menu item
 * @returns string title
 */
export const menuTitles = (item: EMenuItemKey | ESubMenuItemKey | string) => {
  return {
    [EMenuItemKey.Editor]: $t('Editor'),
    [EMenuItemKey.LayoutEditor]: $t('Layout Editor'),
    [EMenuItemKey.StudioMode]: $t('Studio Mode'),
    [EMenuItemKey.Themes]: $t('Overlays'),
    [EMenuItemKey.AppStore]: $t('App Store'),
    [EMenuItemKey.Highlighter]: $t('Highlighter'),
    [EMenuItemKey.RecordingHistory]: $t('Recordings'),
    [EMenuItemKey.ThemeAudit]: $t('Theme Audit'),
    [EMenuItemKey.DevTools]: 'Dev Tools',
    [EMenuItemKey.GetPrime]: $t('Get Ultra'),
    [EMenuItemKey.Dashboard]: $t('Dashboard'),
    [EMenuItemKey.GetHelp]: $t('Get Help'),
    [EMenuItemKey.Settings]: $t('Settings'),
    [EMenuItemKey.Login]: $t('Login'),
    [ESubMenuItemKey.Scene]: $t('Scene'),
    [ESubMenuItemKey.Widget]: $t('Alerts and Widgets'),
    [ESubMenuItemKey.Sites]: $t('Creator Sites'),
    [ESubMenuItemKey.Collectibles]: $t('Collectibles'),
    [ESubMenuItemKey.AppsStoreHome]: $t('Apps Store Home'),
    [ESubMenuItemKey.AppsManager]: $t('Apps Manager'),
    [ESubMenuItemKey.DashboardHome]: $t('Dashboard Home'),
    [ESubMenuItemKey.Cloudbot]: $t('Cloudbot'),
    [ESubMenuItemKey.AlertBoxSettings]: $t('Alert Box Settings'),
    [ESubMenuItemKey.Widgets]: $t('Widgets'),
    [ESubMenuItemKey.TipSettings]: $t('Tip Settings'),
    [ESubMenuItemKey.Multistream]: $t('Multistream'),
  }[item];
};

/**
 * Menu items in the top menu of the side nav
 */
export const SideBarTopNavData = (): IMenu => ({
  name: ENavName.TopNav,
  menuItems: [
    SideNavMenuItems()[EMenuItemKey.Editor],
    SideNavMenuItems()[EMenuItemKey.LayoutEditor],
    SideNavMenuItems()[EMenuItemKey.StudioMode],
    SideNavMenuItems()[EMenuItemKey.Themes],
    SideNavMenuItems()[EMenuItemKey.AppStore],
    SideNavMenuItems()[EMenuItemKey.Highlighter],
    SideNavMenuItems()[EMenuItemKey.RecordingHistory],
    SideNavMenuItems()[EMenuItemKey.ThemeAudit],
  ],
});

/**
 * Menu items in the bottom menu of the side nav
 */
export const SideBarBottomNavData = (): IMenu => ({
  name: ENavName.BottomNav,
  menuItems: [
    SideNavMenuItems()[EMenuItemKey.DevTools],
    SideNavMenuItems()[EMenuItemKey.GetPrime],
    SideNavMenuItems()[EMenuItemKey.Dashboard],
    SideNavMenuItems()[EMenuItemKey.GetHelp],
    SideNavMenuItems()[EMenuItemKey.Settings],
    SideNavMenuItems()[EMenuItemKey.Login],
  ],
});

export type TMenuItems = {
  [MenuItem in Partial<EMenuItemKey>]: IMenuItem | IParentMenuItem;
};

/**
 * Data for menu items in the side nav
 */
export const SideNavMenuItems = (): TMenuItems => ({
  [EMenuItemKey.Editor]: {
    key: EMenuItemKey.Editor,
    target: 'Studio',
    trackingTarget: 'editor',
    icon: 'icon-studio',
    isActive: true,
    isExpanded: false,
  },
  [EMenuItemKey.LayoutEditor]: {
    key: EMenuItemKey.LayoutEditor,
    target: 'LayoutEditor',
    trackingTarget: 'layout-editor',
    icon: 'fas fa-th-large',
    isActive: true,
    isExpanded: false,
  },
  [EMenuItemKey.StudioMode]: {
    key: EMenuItemKey.StudioMode,
    icon: 'icon-studio-mode-3',
    isActive: true,
    isExpanded: false,
  },
  [EMenuItemKey.Themes]: {
    key: EMenuItemKey.Themes,
    target: 'BrowseOverlays',
    trackingTarget: 'themes',
    icon: 'icon-themes',
    subMenuItems: [
      SideBarSubMenuItems()[ESubMenuItemKey.Scene],
      SideBarSubMenuItems()[ESubMenuItemKey.Widget],
      SideBarSubMenuItems()[ESubMenuItemKey.Collectibles],
    ],
    isActive: true,
    isExpanded: false,
  },
  [EMenuItemKey.AppStore]: {
    key: EMenuItemKey.AppStore,
    target: 'PlatformAppStore',
    trackingTarget: 'app-store',
    icon: 'icon-store',
    subMenuItems: [
      SideBarSubMenuItems()[ESubMenuItemKey.AppsStoreHome],
      SideBarSubMenuItems()[ESubMenuItemKey.AppsManager],
    ],
    isActive: true,
    isExpanded: false,
  },
  [EMenuItemKey.Highlighter]: {
    key: EMenuItemKey.Highlighter,
    target: 'Highlighter',
    icon: 'icon-highlighter',
    trackingTarget: 'highlighter',
    isActive: true,
    isExpanded: false,
  },
  [EMenuItemKey.RecordingHistory]: {
    key: EMenuItemKey.RecordingHistory,
    target: 'RecordingHistory',
    icon: 'icon-play-round',
    trackingTarget: 'recording-history',
    isActive: true,
    isExpanded: false,
  },
  [EMenuItemKey.ThemeAudit]: {
    key: EMenuItemKey.ThemeAudit,
    target: 'ThemeAudit',
    icon: 'fas fa-exclamation-triangle',
    trackingTarget: 'themeaudit',
    isExpanded: false,
    isActive: true,
  },
  [EMenuItemKey.DevTools]: {
    key: EMenuItemKey.DevTools,
    trackingTarget: 'devtools',
    icon: 'icon-developer',
    isExpanded: false,
  },
  [EMenuItemKey.GetPrime]: {
    key: EMenuItemKey.GetPrime,
    icon: 'icon-prime',
    isActive: true,
    isExpanded: false,
  },
  [EMenuItemKey.Dashboard]: {
    key: EMenuItemKey.Dashboard,
    icon: 'icon-dashboard',
    isActive: true,
    subMenuItems: [
      SideBarSubMenuItems()[ESubMenuItemKey.DashboardHome],
      SideBarSubMenuItems()[ESubMenuItemKey.Cloudbot],
      SideBarSubMenuItems()[ESubMenuItemKey.AlertBoxSettings],
      SideBarSubMenuItems()[ESubMenuItemKey.Widgets],
      SideBarSubMenuItems()[ESubMenuItemKey.TipSettings],
      SideBarSubMenuItems()[ESubMenuItemKey.Multistream],
    ],
    isExpanded: false,
  },
  [EMenuItemKey.GetHelp]: {
    key: EMenuItemKey.GetHelp,
    icon: 'icon-question',
    isActive: true,
    isExpanded: false,
  },
  [EMenuItemKey.Settings]: {
    key: EMenuItemKey.Settings,
    icon: 'icon-settings',
    isActive: true,
    isExpanded: false,
  },
  [EMenuItemKey.Login]: {
    key: EMenuItemKey.Login,
    icon: 'icon-user',
    isActive: true,
    isExpanded: false,
  },
});

type TSubMenuItems = {
  [MenuItem in ESubMenuItemKey]: IMenuItem | IParentMenuItem;
};

/**
 * Data for sub menu items in the side nav
 */
export const SideBarSubMenuItems = (): TSubMenuItems => ({
  [ESubMenuItemKey.Scene]: {
    key: ESubMenuItemKey.Scene,
    target: 'BrowseOverlays',
    type: 'overlays',
    trackingTarget: 'themes',
    isExpanded: false,
  },
  [ESubMenuItemKey.Widget]: {
    key: ESubMenuItemKey.Widget,
    target: 'BrowseOverlays',
    type: 'widget-themes',
    trackingTarget: 'themes',
    isExpanded: false,
  },
  [ESubMenuItemKey.Sites]: {
    key: ESubMenuItemKey.Sites,
    target: 'BrowseOverlays',
    type: 'site-themes',
    trackingTarget: 'themes',
    isActive: false,
    isExpanded: false,
  },
  [ESubMenuItemKey.Collectibles]: {
    key: ESubMenuItemKey.Collectibles,
    target: 'BrowseOverlays',
    type: 'collectibles',
    trackingTarget: 'themes',
    isExpanded: false,
  },
  [ESubMenuItemKey.AppsStoreHome]: {
    key: ESubMenuItemKey.AppsStoreHome,
    target: 'PlatformAppStore',
    trackingTarget: 'app-store',
    isExpanded: false,
  },
  [ESubMenuItemKey.AppsManager]: {
    key: ESubMenuItemKey.AppsManager,
    target: 'PlatformAppStore',
    type: 'profile',
    trackingTarget: 'app-store',
    isExpanded: false,
  },
  [ESubMenuItemKey.DashboardHome]: {
    key: ESubMenuItemKey.DashboardHome,
    trackingTarget: 'dashboard',
    isExpanded: false,
  },
  [ESubMenuItemKey.Cloudbot]: {
    key: ESubMenuItemKey.Cloudbot,
    type: 'cloudbot',
    trackingTarget: 'dashboard',
    isExpanded: false,
  },
  [ESubMenuItemKey.AlertBoxSettings]: {
    key: ESubMenuItemKey.AlertBoxSettings,
    type: 'alertbox',
    trackingTarget: 'dashboard',
    isExpanded: false,
  },
  [ESubMenuItemKey.Widgets]: {
    key: ESubMenuItemKey.Widgets,
    type: 'widgets',
    trackingTarget: 'dashboard',
    isExpanded: false,
  },
  [ESubMenuItemKey.TipSettings]: {
    key: ESubMenuItemKey.TipSettings,
    type: 'tipping/settings',
    trackingTarget: 'dashboard',
    isExpanded: false,
  },
  [ESubMenuItemKey.Multistream]: {
    key: ESubMenuItemKey.Multistream,
    type: 'multistream',
    trackingTarget: 'dashboard',
    isExpanded: false,
  },
});
