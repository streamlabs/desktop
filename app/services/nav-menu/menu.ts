import {
  DismissablesService,
  HighlighterService,
  LayoutService,
  PlatformAppsService,
  RecordingModeService,
  UserService,
  VisionService,
} from 'app-services';
import { InitAfter, Inject, PersistentStatefulService, ViewHandler } from 'services/core';
import { mutation } from 'services/core/stateful-service';
import { EDismissable } from 'services/dismissables';
import { EAppPageSlot, ILoadedApp } from 'services/platform-apps';
import {
  ENavMenuKey,
  genFeaturesNavMenu,
  genLoggedOutNavMenu,
  INavMenuItemMetadata,
  INavMenuItemPersistedData,
  TNavMenuConfigValue,
  TNavMenuItem,
  TNavMenuTarget,
} from './menu-data';

/** Maximum number of apps that can be pinned to the nav menu. */
export const MAX_PINNED_APPS = 3;

/** A platform app as shown in the nav menu and its settings. */
export interface INavMenuApp {
  id: string;
  name: string;
  iconUrl?: string;
  allowPopout: boolean;
}

interface INavMenuServiceState {
  currentMenuItem: ENavMenuKey;
  menu: INavMenuItemPersistedData[];
  /** Pinned app IDs in display order. */
  pinnedAppIds: string[];
  /** Production app IDs this client has already processed for auto-pinning. */
  seenAppIds: string[];
}

/** Resolves a `TNavMenuConfigValue`, invoking it with `ctx` if it's a callback. */
function resolveConfigValue<T, C>(
  value: TNavMenuConfigValue<T, C> | undefined,
  ctx: C,
): T | undefined {
  return typeof value === 'function' ? (value as (ctx: C) => T)(ctx) : value;
}

class NavMenuViews extends ViewHandler<INavMenuServiceState> {
  get currentMenuItem() {
    return this.state.currentMenuItem;
  }

  private static loggedOutNavKeys: Set<ENavMenuKey>;
  get loggedOutMenuItemKeys() {
    if (!NavMenuViews.loggedOutNavKeys) {
      NavMenuViews.loggedOutNavKeys = new Set(
        NavMenuService.loggedOutNavMenu.menu.map(item => item.key),
      );
    }
    return NavMenuViews.loggedOutNavKeys;
  }

  private static loggedOutNavTargets: Set<TNavMenuTarget>;
  get loggedOutMenuItemTargets() {
    if (!NavMenuViews.loggedOutNavTargets) {
      NavMenuViews.loggedOutNavTargets = new Set(
        NavMenuService.loggedOutNavMenu.menu
          .map(item => NavMenuService.loggedOutNavMenu.data[item.key]?.target)
          .filter(target => target !== undefined),
      );
    }
    return NavMenuViews.loggedOutNavTargets;
  }
}

@InitAfter('PlatformAppsService')
export class NavMenuService extends PersistentStatefulService<INavMenuServiceState> {
  static defaultState: INavMenuServiceState = {
    currentMenuItem: ENavMenuKey.Editor,
    menu: [],
    pinnedAppIds: [],
    seenAppIds: [],
  };

  @Inject() userService: UserService;
  @Inject() dismissablesService: DismissablesService;
  @Inject() highlighterService: HighlighterService;
  @Inject() layoutService: LayoutService;
  @Inject() platformAppsService: PlatformAppsService;
  @Inject() recordingModeService: RecordingModeService;
  @Inject() visionService: VisionService;

  private unwatchRecordings?: () => void;

  /** Whether stale seen app IDs have been pruned yet this app session. */
  private hasPrunedSeenAppIds = false;

  private static _featuresNavMenu: ReturnType<typeof genFeaturesNavMenu>;
  static get featuresNavMenu() {
    if (!NavMenuService._featuresNavMenu) {
      NavMenuService._featuresNavMenu = genFeaturesNavMenu();
    }
    return NavMenuService._featuresNavMenu;
  }

  private static _loggedOutNavMenu: ReturnType<typeof genLoggedOutNavMenu>;
  static get loggedOutNavMenu() {
    if (!NavMenuService._loggedOutNavMenu) {
      NavMenuService._loggedOutNavMenu = genLoggedOutNavMenu();
    }
    return NavMenuService._loggedOutNavMenu;
  }

  init() {
    super.init();
    this.userService.userLoginFinished.subscribe(() => this.handleUserLogin());

    this.handleDismissables();
    this.UPDATE_PERSISTED_MENU_ITEMS(this.availableMenuKeys);
    this.watchRecordingsVisibility();
    this.state.currentMenuItem = ENavMenuKey.Editor;
  }

  get views() {
    return new NavMenuViews(this.state);
  }

  private get availableMenuKeys(): ENavMenuKey[] {
    const { menu, data } = NavMenuService.featuresNavMenu;
    const ctx = { vision: this.visionService };
    return menu
      .map(item => item.key)
      .filter(key => resolveConfigValue(data[key]?.isAvailable, ctx) ?? true);
  }

  private get availableMenuItemsData() {
    const itemData = NavMenuService.featuresNavMenu.data;
    const ctx = { vision: this.visionService };
    return this.state.menu
      .map<[INavMenuItemPersistedData, INavMenuItemMetadata]>(item => [item, itemData[item.key]])
      .filter(([item, data]) => {
        if (!data) {
          console.error('NavMenuService: Missing menu item data for key:', item.key);
          return false;
        }
        return resolveConfigValue(data.isAvailable, ctx) ?? true;
      });
  }

  private isItemLocked(data: INavMenuItemMetadata) {
    return resolveConfigValue(data.isVisibilityLocked, { user: this.userService }) ?? false;
  }

  /** Resolves whether an item is shown. Locked items are always shown, otherwise an explicit user choice wins over the default. */
  private isItemVisible(item: INavMenuItemPersistedData, data: INavMenuItemMetadata) {
    if (this.isItemLocked(data)) return true;
    const ctx = { user: this.userService };
    return item.isVisible ?? resolveConfigValue(data.isVisibleByDefault, ctx) ?? true;
  }

  get availableMenuItems() {
    return this.availableMenuItemsData.map(([item, data]) => ({
      key: item.key,
      title: data.title,
      isVisible: this.isItemVisible(item, data),
      isLocked: this.isItemLocked(data),
    }));
  }

  get menuItems() {
    return this.availableMenuItemsData
      .filter(([item, data]) => this.isItemVisible(item, data))
      .map<TNavMenuItem>(([item, data]) => ({
        ...item,
        ...data,
        badge:
          typeof data.badge === 'function'
            ? data.badge({ highlighter: this.highlighterService })
            : data.badge,
      }));
  }

  private toNavMenuApp(app: ILoadedApp): INavMenuApp {
    let iconUrl: string | undefined = app.icon;
    if (!iconUrl && app.manifest.icon) {
      iconUrl = this.platformAppsService.views.getAssetUrl(app.id, app.manifest.icon) ?? undefined;
    }
    const topNavPage = app.manifest.pages.find(page => page.slot === EAppPageSlot.TopNav);
    const allowPopout = topNavPage?.allowPopout ?? true;
    return { id: app.id, name: app.manifest.name, iconUrl, allowPopout };
  }

  /** Enabled apps that have a top nav page, and so can be pinned. */
  get pinnableApps(): INavMenuApp[] {
    return this.platformAppsService.views.enabledApps
      .filter(app => app.manifest?.pages?.some(page => page.slot === EAppPageSlot.TopNav))
      .map(app => this.toNavMenuApp(app));
  }

  /**
   * Pinned apps in display order. Stale IDs (disabled, uninstalled, still loading) are
   * skipped but deliberately kept in state, since app reloads transiently unload everything.
   */
  get pinnedApps(): INavMenuApp[] {
    const pinnable = this.pinnableApps;
    return this.state.pinnedAppIds
      .map(id => pinnable.find(app => app.id === id))
      .filter((app): app is INavMenuApp => !!app);
  }

  /** Index in `menuItems` at which pinned apps are inserted (right after App Store). */
  get pinnedAppsMenuIndex(): number {
    const keys = this.availableMenuItemsData.map(([item]) => item.key);
    const leading = new Set(keys.slice(0, keys.indexOf(ENavMenuKey.AppStore) + 1));
    return this.menuItems.filter(item => leading.has(item.key)).length;
  }

  setAppPinned(appId: string, isPinned: boolean) {
    const pinnedIds = this.pinnedApps.map(app => app.id);
    if (isPinned) {
      if (pinnedIds.includes(appId)) return;
      if (pinnedIds.length >= MAX_PINNED_APPS) return;
      if (!this.pinnableApps.some(app => app.id === appId)) return;
      this.SET_PINNED_APP_IDS([...pinnedIds, appId]);
    } else {
      this.SET_PINNED_APP_IDS(this.state.pinnedAppIds.filter(id => id !== appId));
    }
  }

  /**
   * Marks newly loaded production apps as seen, pinning pinnable ones while slots remain.
   * Called by PlatformAppsService once production apps finish loading.
   *
   * The first non-empty load of each app session also drops seen IDs for apps that are no
   * longer installed, so reinstalling one later auto-pins it again. Empty loads are skipped
   * because `fetchProductionApps` returns `[]` on network errors, which would wipe the list.
   */
  pinNewApps() {
    const productionApps = this.platformAppsService.views.productionApps;
    const installedIds = new Set(productionApps.map(app => app.id));

    let seenIds = this.state.seenAppIds;
    if (!this.hasPrunedSeenAppIds && installedIds.size) {
      this.hasPrunedSeenAppIds = true;
      seenIds = seenIds.filter(id => installedIds.has(id));
    }

    const seen = new Set(seenIds);
    const newApps = productionApps.filter(app => !seen.has(app.id));

    if (newApps.length) {
      const pinnedIds = this.pinnedApps.map(app => app.id);
      const pinnableIds = new Set(this.pinnableApps.map(app => app.id));
      const toPin = newApps
        .filter(app => pinnableIds.has(app.id) && !pinnedIds.includes(app.id))
        .slice(0, Math.max(0, MAX_PINNED_APPS - pinnedIds.length))
        .map(app => app.id);

      if (toPin.length) this.SET_PINNED_APP_IDS([...pinnedIds, ...toPin]);
    }

    if (newApps.length || seenIds.length !== this.state.seenAppIds.length) {
      this.SET_SEEN_APP_IDS([...seenIds, ...newApps.map(app => app.id)]);
    }
  }

  setCurrentMenuItem(key: ENavMenuKey) {
    this.SET_CURRENT_MENU_ITEM(key);
  }

  handleUserLogin() {
    this.UPDATE_PERSISTED_MENU_ITEMS(this.availableMenuKeys);
    this.SET_CURRENT_MENU_ITEM(ENavMenuKey.Editor);
    this.dismissablesService.dismiss(EDismissable.LoginPrompt);
  }

  handleDismissables() {
    if (!this.userService.views.isLoggedIn) {
      this.dismissablesService.views.shouldShow(EDismissable.LoginPrompt);
    }
  }

  toggleMenuItem(key: ENavMenuKey, isVisible: boolean) {
    const data = NavMenuService.featuresNavMenu.data[key];
    if (data && this.isItemLocked(data)) return;
    if (key === ENavMenuKey.RecordingHistory) {
      // The user has made an explicit choice; the auto-reveal latch must not override it.
      this.stopWatchingRecordings();
    }
    this.SET_MENU_ITEM_STATUS(key, isVisible);
  }

  resetMenuItems() {
    this.RESET_MENU_ITEMS(this.availableMenuKeys);
    this.watchRecordingsVisibility(); // re-arm the latch against the cleared state
  }

  private get shouldRevealRecordings() {
    return (
      this.recordingModeService.views.isRecordingModeEnabled ||
      this.recordingModeService.views.hasRecordings
    );
  }

  /**
   * Reveal the Recordings item the first time the user has recordings or turns on
   * recording-only mode. One-way: the `=== undefined` check means an explicit user
   * choice in settings is never overwritten, and the watch is torn down as soon as
   * `isVisible` is decided either way.
   */
  private watchRecordingsVisibility() {
    this.stopWatchingRecordings();

    const item = this.state.menu.find(i => i.key === ENavMenuKey.RecordingHistory);
    if (!item || item.isVisible !== undefined) return; // already decided

    // App-start case: recording state is hydrated from localStorage before any init().
    if (this.shouldRevealRecordings) {
      this.SET_MENU_ITEM_STATUS(ENavMenuKey.RecordingHistory, true);
      return;
    }

    this.unwatchRecordings = this.store.watch(
      () => this.shouldRevealRecordings,
      shouldReveal => {
        if (!shouldReveal) return;
        this.SET_MENU_ITEM_STATUS(ENavMenuKey.RecordingHistory, true);
        this.stopWatchingRecordings();
      },
    );
  }

  private stopWatchingRecordings() {
    this.unwatchRecordings?.();
    this.unwatchRecordings = undefined;
  }

  @mutation()
  private UPDATE_PERSISTED_MENU_ITEMS(availableKeys: ENavMenuKey[]) {
    const persisted = this.state.menu ?? [];
    this.state.menu = NavMenuService.featuresNavMenu.menu
      .filter(item => availableKeys.includes(item.key))
      .map(item => {
        const isVisible = persisted.find(p => p.key === item.key)?.isVisible;
        // Omit rather than store `undefined` so the persisted payload stays minimal.
        return isVisible === undefined ? { key: item.key } : { key: item.key, isVisible };
      });
  }

  @mutation()
  private RESET_MENU_ITEMS(availableKeys: ENavMenuKey[]) {
    this.state.menu = NavMenuService.featuresNavMenu.menu
      .filter(item => availableKeys.includes(item.key))
      .map(item => ({ key: item.key }));
  }

  @mutation()
  private SET_CURRENT_MENU_ITEM(key: ENavMenuKey) {
    if (!(key in NavMenuService.featuresNavMenu.data)) {
      console.error('NavMenuService: Attempted to set current menu item to invalid key:', key);
      return;
    }
    this.state.currentMenuItem = key;
  }

  @mutation()
  private SET_MENU_ITEM_STATUS(key: ENavMenuKey, isVisible: boolean) {
    this.state.menu = this.state.menu.map(item => {
      if (item.key === key) {
        return { ...item, isVisible };
      }
      return item;
    });
  }

  @mutation()
  private SET_PINNED_APP_IDS(ids: string[]) {
    this.state.pinnedAppIds = ids;
  }

  @mutation()
  private SET_SEEN_APP_IDS(ids: string[]) {
    this.state.seenAppIds = ids;
  }
}
