import { $t } from 'services/i18n';
import { TAppPage } from 'services/navigation';

/**
 * Update Menu Items
 * 1. ENavMenuKey: Add/update/remove enum in ENavMenuKey.
 * 2. Add string title to menuTitles.
 * 3. Add an entry to NavMenuItems. Use the toolMenuItems property to add sub-menu items from NavMenuToolItems to the menu item.
 * 4. To show the menu item, add it to either NavMenuTopNavData or NavMenuBottomNavData.
 * 5. To show a menu item in the top nav to a logged out user, add it to loggedOutMenuItems.
 * 6. To show a menu item in the top nav compact menu, add it to compactMenuItemKeys.
 */
export enum ENavMenuFeatures {
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
  AI = 'ai',
}

/**
 * Update ToolMenu Items
 * 1. ENavMenuTool: Add/update/remove enum.
 * 2. Add string title to menuTitles.
 * 3. Add entry to NavMenuSubItems.
 * 4. To show the submenu item, add it to a menu item entry in NavMenuItems by using the subMenuItems property.
 */
export enum ENavMenuTools {
  Scene = 'browse-overlays',
  Widget = 'browse-overlays-widgets',
  Sites = 'browse-overlays-sites',
  AppsStoreHome = 'platform-app-store-home',
  AppsManager = 'platform-app-store-manager',
  DashboardHome = 'dashboard-home',
  Cloudbot = 'dashboard-cloudbot',
  AlertBoxSettings = 'dashboard-alertbox',
  Widgets = 'dashboard-widgets',
  TipSettings = 'dashboard-tips',
  Multistream = 'dashboard-multistream',
}

export const ENavMenuKey = { ...ENavMenuFeatures, ...ENavMenuTools };
export type TNavMenuKey = ENavMenuFeatures | ENavMenuTools;

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
 * Add custom nav item targets here. This is for menu items that don't fit
 * the standard target/type model.
 */
export type TCustomNavItem = never;

/**
 * Update Protocol Link Map
 * 1. Confirm protocol link parameter for url.
 * 2. Add/update/remove entry in ProtocolLinkKeyMap. The key is the url parameter.
 */
export const ProtocolLinkKeyMap = {
  ['overlay']: ENavMenuKey.Scene,
  ['widget-theme']: ENavMenuKey.Widget,
  ['site-theme']: ENavMenuKey.Sites,
};

type TNavMenuItem = TAppPage | TExternalLinkType | 'NavTools' | 'WidgetWindow' | TCustomNavItem;
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

interface INavMenuItem {
  key: TNavMenuKey;
  target?: TNavMenuItem; // optional because menu item could be a toggle
}
export interface IMenuItem extends INavMenuItem {
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
  FeaturesNav = 'features-nav',
  ToolsNav = 'tools-nav',
}

export const loggedOutMenuItems: INavMenuItem[] = [
  {
    key: ENavMenuKey.Editor,
    target: 'Studio',
  },
  { key: ENavMenuKey.RecordingHistory, target: 'RecordingHistory' },
];

export const compactMenuItemKeys: Set<TNavMenuKey> = new Set([
  ENavMenuKey.Editor,
  ENavMenuKey.Themes,
  ENavMenuKey.AppStore,
  ENavMenuKey.Highlighter,
  ENavMenuKey.AI,
  ENavMenuKey.RecordingHistory,
]);

/**
 * The string titles for the menu items and submenu items
 * @param item - key for the menu item
 * @returns string title
 */
export const menuTitles = (item: TNavMenuKey | string) => {
  return {
    [ENavMenuKey.Editor]: $t('Editor'),
    [ENavMenuKey.LayoutEditor]: $t('Layout Editor'),
    [ENavMenuKey.StudioMode]: $t('Studio Mode'),
    [ENavMenuKey.Themes]: $t('Overlays'),
    [ENavMenuKey.AppStore]: $t('App Store'),
    [ENavMenuKey.Highlighter]: $t('Highlighter'),
    [ENavMenuKey.AI]: $t('AI'),
    [ENavMenuKey.RecordingHistory]: $t('Recordings'),
    [ENavMenuKey.ThemeAudit]: $t('Theme Audit'),
    [ENavMenuKey.DevTools]: 'Dev Tools',
    [ENavMenuKey.GetPrime]: $t('Get Ultra'),
    [ENavMenuKey.Dashboard]: $t('Dashboard'),
    [ENavMenuKey.GetHelp]: $t('Get Help'),
    [ENavMenuKey.Settings]: $t('Settings'),
    [ENavMenuKey.Login]: $t('Login'),
    [ENavMenuKey.Scene]: $t('Scene'),
    [ENavMenuKey.Widget]: $t('Alerts and Widgets'),
    [ENavMenuKey.Sites]: $t('Creator Sites'),
    [ENavMenuKey.AppsStoreHome]: $t('Apps Store Home'),
    [ENavMenuKey.AppsManager]: $t('Apps Manager'),
    [ENavMenuKey.DashboardHome]: $t('Dashboard Home'),
    [ENavMenuKey.Cloudbot]: $t('Cloudbot'),
    [ENavMenuKey.AlertBoxSettings]: $t('Alert Box Settings'),
    [ENavMenuKey.Widgets]: $t('Widgets'),
    [ENavMenuKey.TipSettings]: $t('Tip Settings'),
    [ENavMenuKey.Multistream]: $t('Multistream'),
  }[item];
};

/** Main nav items — navigable, can be active. */
export const NavMenuFeaturesData = (): IMenu => {
  const menuItems = NavMenuItems();
  return {
    name: ENavName.FeaturesNav,
    menuItems: [
      menuItems[ENavMenuKey.Editor],
      menuItems[ENavMenuKey.LayoutEditor],
      menuItems[ENavMenuKey.StudioMode],
      menuItems[ENavMenuKey.Themes],
      menuItems[ENavMenuKey.AppStore],
      menuItems[ENavMenuKey.Highlighter],
      menuItems[ENavMenuKey.AI],
      menuItems[ENavMenuKey.RecordingHistory],
      menuItems[ENavMenuKey.ThemeAudit],
    ],
  };
};

/**
 * Menu items in the bottom menu of the nav menu
 */
export const NavMenuToolsData = (): IMenu => {
  const menuItems = NavMenuItems();
  return {
    name: ENavName.ToolsNav,
    menuItems: [
      menuItems[ENavMenuKey.DevTools],
      menuItems[ENavMenuKey.GetPrime],
      menuItems[ENavMenuKey.Dashboard],
      menuItems[ENavMenuKey.GetHelp],
      menuItems[ENavMenuKey.Settings],
      menuItems[ENavMenuKey.Login],
    ],
  };
};

export type TMenuItems = {
  [MenuItem in Partial<ENavMenuFeatures>]: IMenuItem | IParentMenuItem;
};

/**
 * Data for menu items in the nav menu
 */
export const NavMenuItems = (): TMenuItems => {
  const subMenuItems = NavMenuSubItems();
  return {
    [ENavMenuKey.Editor]: {
      key: ENavMenuKey.Editor,
      target: 'Studio',
      trackingTarget: 'editor',
      icon: 'icon-studio',
      isActive: true,
      isExpanded: false,
    },
    [ENavMenuKey.LayoutEditor]: {
      key: ENavMenuKey.LayoutEditor,
      target: 'LayoutEditor',
      trackingTarget: 'layout-editor',
      icon: 'fas fa-th-large',
      isActive: true,
      isExpanded: false,
    },
    [ENavMenuKey.StudioMode]: {
      key: ENavMenuKey.StudioMode,
      icon: 'icon-studio-mode-3',
      isActive: true,
      isExpanded: false,
    },
    [ENavMenuKey.Themes]: {
      key: ENavMenuKey.Themes,
      target: 'BrowseOverlays',
      trackingTarget: 'themes',
      icon: 'icon-themes',
      subMenuItems: [subMenuItems[ENavMenuKey.Scene], subMenuItems[ENavMenuKey.Widget]],
      isActive: true,
      isExpanded: false,
    },
    [ENavMenuKey.AppStore]: {
      key: ENavMenuKey.AppStore,
      target: 'PlatformAppStore',
      trackingTarget: 'app-store',
      icon: 'icon-store',
      subMenuItems: [
        subMenuItems[ENavMenuKey.AppsStoreHome],
        subMenuItems[ENavMenuKey.AppsManager],
      ],
      isActive: true,
      isExpanded: false,
    },
    [ENavMenuKey.Highlighter]: {
      key: ENavMenuKey.Highlighter,
      target: 'Highlighter',
      icon: 'icon-highlighter',
      trackingTarget: 'highlighter',
      isActive: true,
      isExpanded: false,
    },
    [ENavMenuKey.AI]: {
      key: ENavMenuKey.AI,
      target: 'AILanding',
      icon: 'icon-ai',
      trackingTarget: 'ai',
      isActive: true,
      isExpanded: false,
    },
    [ENavMenuKey.RecordingHistory]: {
      key: ENavMenuKey.RecordingHistory,
      target: 'RecordingHistory',
      icon: 'icon-play-round',
      trackingTarget: 'recording-history',
      isActive: true,
      isExpanded: false,
    },
    [ENavMenuKey.ThemeAudit]: {
      key: ENavMenuKey.ThemeAudit,
      target: 'ThemeAudit',
      icon: 'fas fa-exclamation-triangle',
      trackingTarget: 'themeaudit',
      isExpanded: false,
      isActive: true,
    },
    [ENavMenuKey.DevTools]: {
      key: ENavMenuKey.DevTools,
      trackingTarget: 'devtools',
      icon: 'icon-developer',
      isExpanded: false,
    },
    [ENavMenuKey.GetPrime]: {
      key: ENavMenuKey.GetPrime,
      icon: 'icon-prime',
      isActive: true,
      isExpanded: false,
    },
    [ENavMenuKey.Dashboard]: {
      key: ENavMenuKey.Dashboard,
      icon: 'icon-dashboard',
      isActive: true,
      subMenuItems: [
        subMenuItems[ENavMenuKey.DashboardHome],
        subMenuItems[ENavMenuKey.Cloudbot],
        subMenuItems[ENavMenuKey.AlertBoxSettings],
        subMenuItems[ENavMenuKey.Widgets],
        subMenuItems[ENavMenuKey.TipSettings],
        subMenuItems[ENavMenuKey.Multistream],
      ],
      isExpanded: false,
    },
    [ENavMenuKey.GetHelp]: {
      key: ENavMenuKey.GetHelp,
      icon: 'icon-question',
      isActive: true,
      isExpanded: false,
    },
    [ENavMenuKey.Settings]: {
      key: ENavMenuKey.Settings,
      icon: 'icon-settings',
      isActive: true,
      isExpanded: false,
    },
    [ENavMenuKey.Login]: {
      key: ENavMenuKey.Login,
      icon: 'icon-user',
      isActive: true,
      isExpanded: false,
    },
  };
};

type TSubMenuItems = {
  [MenuItem in ENavMenuTools]: IMenuItem | IParentMenuItem;
};

/**
 * Data for sub menu items in the nav menu
 */
export const NavMenuSubItems = (): TSubMenuItems => ({
  [ENavMenuKey.Scene]: {
    key: ENavMenuKey.Scene,
    target: 'BrowseOverlays',
    type: 'overlays',
    trackingTarget: 'themes',
    isExpanded: false,
  },
  [ENavMenuKey.Widget]: {
    key: ENavMenuKey.Widget,
    target: 'BrowseOverlays',
    type: 'widget-themes',
    trackingTarget: 'themes',
    isExpanded: false,
  },
  [ENavMenuKey.Sites]: {
    key: ENavMenuKey.Sites,
    target: 'BrowseOverlays',
    type: 'site-themes',
    trackingTarget: 'themes',
    isActive: false,
    isExpanded: false,
  },
  [ENavMenuKey.AppsStoreHome]: {
    key: ENavMenuKey.AppsStoreHome,
    target: 'PlatformAppStore',
    trackingTarget: 'app-store',
    isExpanded: false,
  },
  [ENavMenuKey.AppsManager]: {
    key: ENavMenuKey.AppsManager,
    target: 'PlatformAppStore',
    type: 'profile',
    trackingTarget: 'app-store',
    isExpanded: false,
  },
  [ENavMenuKey.DashboardHome]: {
    key: ENavMenuKey.DashboardHome,
    trackingTarget: 'dashboard',
    isExpanded: false,
  },
  [ENavMenuKey.Cloudbot]: {
    key: ENavMenuKey.Cloudbot,
    type: 'cloudbot',
    trackingTarget: 'dashboard',
    isExpanded: false,
  },
  [ENavMenuKey.AlertBoxSettings]: {
    key: ENavMenuKey.AlertBoxSettings,
    type: 'alertbox',
    trackingTarget: 'dashboard',
    isExpanded: false,
  },
  [ENavMenuKey.Widgets]: {
    key: ENavMenuKey.Widgets,
    type: 'widgets',
    trackingTarget: 'dashboard',
    isExpanded: false,
  },
  [ENavMenuKey.TipSettings]: {
    key: ENavMenuKey.TipSettings,
    type: 'tipping/settings',
    trackingTarget: 'dashboard',
    isExpanded: false,
  },
  [ENavMenuKey.Multistream]: {
    key: ENavMenuKey.Multistream,
    type: 'multistream',
    trackingTarget: 'dashboard',
    isExpanded: false,
  },
});
