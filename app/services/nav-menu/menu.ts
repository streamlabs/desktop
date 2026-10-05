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

interface INavMenuServiceState {
  currentMenuItem: ENavMenuKey;
  menu: INavMenuItemPersistedData[];
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
  @Inject() userService: UserService;
  @Inject() dismissablesService: DismissablesService;
  @Inject() highlighterService: HighlighterService;
  @Inject() layoutService: LayoutService;
  @Inject() platformAppsService: PlatformAppsService;
  @Inject() recordingModeService: RecordingModeService;
  @Inject() visionService: VisionService;

  private unwatchRecordings?: () => void;

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

  /** Resolves whether an item is shown, honoring an explicit user choice over the default. */
  private isItemVisible(item: INavMenuItemPersistedData, data: INavMenuItemMetadata) {
    const ctx = { user: this.userService };
    return item.isVisible ?? resolveConfigValue(data.isVisibleByDefault, ctx) ?? true;
  }

  get availableMenuItems() {
    return this.availableMenuItemsData.map(([item, data]) => ({
      key: item.key,
      title: data.title,
      isVisible: this.isItemVisible(item, data),
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
}
