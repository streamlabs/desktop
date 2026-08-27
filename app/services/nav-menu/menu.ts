import {
  DismissablesService,
  HighlighterService,
  LayoutService,
  PlatformAppsService,
  UserService,
  VisionService,
} from 'app-services';
import { cloneDeep } from 'lodash';
import { InitAfter, Inject, PersistentStatefulService, ViewHandler } from 'services/core';
import { mutation } from 'services/core/stateful-service';
import { EDismissable } from 'services/dismissables';
import {
  ENavMenuKey,
  genFeaturesNavMenu,
  genLoggedOutNavMenu,
  INavMenuItemMetadata,
  INavMenuItemPersistedData,
  TNavMenuItem,
  TNavMenuTarget,
} from './menu-data';

interface INavMenuServiceState {
  version: string;
  currentMenuItem: ENavMenuKey;
  menu: INavMenuItemPersistedData[];
}

class NavMenuViews extends ViewHandler<INavMenuServiceState> {
  get menuItemStatus() {
    return this.state.menu.reduce((record, menuItem) => {
      record[menuItem.key] = menuItem.isVisible ?? true;
      return record;
    }, {} as Record<ENavMenuKey, boolean>);
  }

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
  @Inject() visionService: VisionService;

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
    this.UPDATE_PERSISTED_MENU_ITEMS();
    this.state.currentMenuItem = ENavMenuKey.Editor;
  }

  get views() {
    return new NavMenuViews(this.state);
  }

  private get activeMenuItemsData() {
    const itemData = NavMenuService.featuresNavMenu.data;
    return this.state.menu
      .map<[INavMenuItemPersistedData, INavMenuItemMetadata]>(item => [item, itemData[item.key]])
      .filter(([item, data]) => {
        if (!data) {
          console.error('NavMenuService: Missing menu item data for key:', item.key);
          return false;
        }
        if (data.isActive === false) {
          return false;
        }
        if (
          typeof data.isActive === 'function' &&
          !data.isActive({ vision: this.visionService, user: this.userService })
        ) {
          return false;
        }
        return true;
      });
  }

  get activeMenuItems() {
    return this.activeMenuItemsData.map(([item, data]) => ({ key: item.key, title: data.title }));
  }

  get menuItems() {
    return this.activeMenuItemsData
      .filter(([item]) => item.isVisible ?? true)
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
    this.UPDATE_PERSISTED_MENU_ITEMS();
    this.SET_CURRENT_MENU_ITEM(ENavMenuKey.Editor);
    this.dismissablesService.dismiss(EDismissable.LoginPrompt);
  }

  handleDismissables() {
    if (!this.userService.views.isLoggedIn) {
      this.dismissablesService.views.shouldShow(EDismissable.LoginPrompt);
      return;
    }

    // TODO @nav: Add dismissables for new nav experience
  }

  toggleMenuItem(item: ENavMenuKey, isVisible?: boolean) {
    this.SET_MENU_ITEM_STATUS(item, isVisible);
  }

  @mutation()
  private UPDATE_PERSISTED_MENU_ITEMS() {
    if (!this.state.menu) {
      this.state.menu = cloneDeep(NavMenuService.featuresNavMenu.menu);
      return;
    }
    this.state.menu = NavMenuService.featuresNavMenu.menu.map(item => {
      const persistedItem = this.state.menu.find(persisted => persisted.key === item.key);
      return { ...item, isVisible: persistedItem?.isVisible ?? item.isVisible };
    });
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
  private SET_MENU_ITEM_STATUS(key: ENavMenuKey, isVisible?: boolean) {
    this.state.menu = this.state.menu.map(item => {
      if (item.key === key) {
        return { ...item, isVisible: isVisible ?? !item?.isVisible };
      }
      return item;
    });
  }
}
