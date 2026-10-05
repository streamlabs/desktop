import { HighlighterService, UserService, VisionService } from 'app-services';
import cloneDeep from 'lodash/cloneDeep';
import { $t } from 'services/i18n';
import { TAppPage } from 'services/navigation';
import Utils from 'services/utils';

/**
 * Update Menu Items
 * 1. ENavMenuKey: Add/update/remove enum in ENavMenuKey.
 * 2. Add metadata to NavMenuItemData() under the new key.
 * 3. Add the key to genFeaturesNavMenu() to show it in the main (features) nav.
 * 4. To show a menu item when logged out, add it to genLoggedOutNavMenu().
 */
export enum ENavMenuKey {
  Editor = 'editor',
  LayoutEditor = 'layout-editor',
  Themes = 'themes',
  AppStore = 'app-store',
  Highlighter = 'highlighter',
  Cloudbot = 'cloudbot',
  Vision = 'vision',
  RecordingHistory = 'recording-history',
  Ultra = 'ultra',
}

/**
 * External links that can be opened from the nav menu.
 *
 * @note To update external links:
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

/** Custom navigation items that are not represented by another type. */
export type TCustomNavItem = 'ToolsNav' | 'WidgetWindow' | 'Ultra';

/** Navigation targets that are present in the nav menu. */
export type TNavMenuTarget = TAppPage | TExternalLinkType | TCustomNavItem;

/** Config values for menu data. Can be a callback requiring context passed in from a service or view. */
export type TNavMenuConfigValue<T, C> = T | ((ctx: C) => T);

/** Static metadata for a nav menu item. */
export interface INavMenuItemMetadata {
  title: string;
  badge?: TNavMenuConfigValue<string, { highlighter: HighlighterService }>;
  icon?: string;
  type?: TExternalLinkType | string;
  target?: TNavMenuTarget;
  trackingTarget?: string;
  /**
   * Whether the menu item is available at all on this system (e.g. OS support).
   * Unavailable items are hidden from the nav *and* from the settings toggles,
   * cannot be enabled by the user, and are pruned from the persisted menu.
   * Defaults to true.
   */
  isAvailable?: TNavMenuConfigValue<boolean, { vision: VisionService }>;
  /**
   * Default nav visibility, used only when the user has made no explicit choice
   * (persisted `isVisible` is undefined). Defaults to true.
   */
  isVisibleByDefault?: TNavMenuConfigValue<boolean, { user: UserService }>;
}

type TExtractCtx<V> = V extends (ctx: infer C) => any ? C : never;
type OmitNever<T> = Pick<T, { [K in keyof T]: T[K] extends never ? never : K }[keyof T]>;

export type TNavMenuItemContext = OmitNever<
  Required<{ [K in keyof INavMenuItemMetadata]: TExtractCtx<NonNullable<INavMenuItemMetadata[K]>> }>
>;

/** Metadata for a nav menu item that is persisted to the menu store. */
export interface INavMenuItemPersistedData {
  key: ENavMenuKey;
  /**
   * Whether the menu item is visible due to current *user* configuration
   * (e.g. enabled vs disabled in settings).
   *
   * Tri-state: `undefined` means the user hasn't made an explicit choice yet,
   * in which case the item's `isActive` default applies. `true`/`false` is an
   * explicit choice and always wins.
   */
  isVisible?: boolean;
}
/**
 * Metadata for a nav menu item. Includes static and persisted metadata.
 * This is used to generate the menu items in the nav menu.
 */
export type TNavMenuItem = Prettify<
  Omit<INavMenuItemPersistedData, 'isVisible'> &
    Omit<INavMenuItemMetadata, 'isAvailable' | 'isVisibleByDefault' | 'badge'> & { badge?: string }
>;

export const NavMenuItemData = (): Record<ENavMenuKey, INavMenuItemMetadata> => ({
  [ENavMenuKey.Vision]: {
    title: $t('Vision'),
    icon: 'icon-ai',
    target: 'VisionLanding',
    trackingTarget: 'vision',
    isAvailable: ({ vision }) => vision.isSupportedForOs(),
  },
  [ENavMenuKey.AppStore]: {
    title: $t('App Store'),
    icon: 'icon-store',
    target: 'PlatformAppStore',
    trackingTarget: 'app-store',
  },
  [ENavMenuKey.Cloudbot]: {
    title: $t('Cloudbot'),
    icon: 'icon-cloudbot',
    type: 'cloudbot',
    trackingTarget: 'cloudbot',
  },
  [ENavMenuKey.Editor]: {
    title: $t('Editor'),
    icon: 'icon-studio',
    target: 'Studio',
    trackingTarget: 'editor',
  },
  [ENavMenuKey.Highlighter]: {
    title: $t('Highlighter'),
    target: 'Highlighter',
    trackingTarget: 'highlighter',
    icon: 'icon-highlighter',
    badge: ({ highlighter }) => {
      if (highlighter.aiHighlighterFeatureEnabled) {
        const env = Utils.getHighlighterEnvironment();
        return env === 'production' ? 'beta' : env;
      }
      return '';
    },
  },
  [ENavMenuKey.LayoutEditor]: {
    title: $t('Layouts'),
    icon: 'fas fa-th-large',
    target: 'LayoutEditor',
    trackingTarget: 'layout-editor',
  },
  [ENavMenuKey.Themes]: {
    title: $t('Overlays'),
    icon: 'icon-themes',
    target: 'BrowseOverlays',
    type: 'overlays',
    trackingTarget: 'themes',
  },
  [ENavMenuKey.RecordingHistory]: {
    title: $t('Recordings'),
    icon: 'icon-play-round',
    target: 'RecordingHistory',
    trackingTarget: 'recording-history',
    // Hidden until the user records something or turns on recording-only mode.
    isVisibleByDefault: false,
  },
  [ENavMenuKey.Ultra]: {
    title: $t('Ultra'),
    icon: 'icon-ultra',
    target: 'Ultra',
    trackingTarget: 'ultra',
    isVisibleByDefault: ({ user }) => !user.views.isPrime,
  },
});

function genNavMenu(
  ...keys: ENavMenuKey[]
): { menu: INavMenuItemPersistedData[]; data: PartialRec<ENavMenuKey, INavMenuItemMetadata> } {
  const navMenuItemData = NavMenuItemData();
  const data: PartialRec<ENavMenuKey, INavMenuItemMetadata> = {};
  const menu: INavMenuItemPersistedData[] = [];
  keys.forEach(key => {
    data[key] = Object.freeze(cloneDeep(navMenuItemData[key]));
    // isVisible starts unset (tri-state) so an item's `isVisibleByDefault`
    // applies until the user makes an explicit choice.
    menu.push({ key });
  });
  return { menu, data };
}

/** Logged-out nav items — navigable, can be active. */
export const genLoggedOutNavMenu = () =>
  genNavMenu(ENavMenuKey.Editor, ENavMenuKey.RecordingHistory, ENavMenuKey.Ultra);

/** Main nav items — navigable, can be active. */
export const genFeaturesNavMenu = () =>
  genNavMenu(
    ENavMenuKey.Editor,
    ENavMenuKey.LayoutEditor,
    ENavMenuKey.Themes,
    ENavMenuKey.AppStore,
    ENavMenuKey.Highlighter,
    ENavMenuKey.Cloudbot,
    ENavMenuKey.Vision,
    ENavMenuKey.RecordingHistory,
    ENavMenuKey.Ultra,
  );
