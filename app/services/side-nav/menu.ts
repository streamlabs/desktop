import { ViewHandler, InitAfter, PersistentStatefulService, Inject } from 'services/core';
import { mutation } from 'services/core/stateful-service';
import {
  UserService,
  AppService,
  DismissablesService,
  LayoutService,
  PlatformAppsService,
} from 'app-services';
import { ILoadedApp } from 'services/platform-apps';
import { EDismissable } from 'services/dismissables';
import {
  EMenuItemKey,
  IMenuItem,
  IParentMenuItem,
  SideNavMenuItems,
  ENavName,
  IMenu,
  IAppMenuItem,
  SideBarTopNavData,
  SideBarBottomNavData,
  loggedOutMenuItems,
} from './menu-data';

interface ISideNavServiceState {
  version: string;
  isOpen: boolean;
  showCustomEditor: boolean;
  hasLegacyMenu: boolean;
  compactView: boolean;
  currentMenuItem: EMenuItemKey | string;
  apps: IAppMenuItem[];
  [ENavName.TopNav]: IMenu;
  [ENavName.BottomNav]: IMenu;
}

class SideNavViews extends ViewHandler<ISideNavServiceState> {
  get isOpen() {
    return this.state.isOpen;
  }

  get compactView() {
    return this.state.compactView;
  }

  get menuItemStatus() {
    return this.state[ENavName.TopNav].menuItems.reduce((menuItems, menuItem) => {
      return { ...menuItems, [menuItem.key]: menuItem.isActive };
    }, {});
  }

  get hasLegacyMenu() {
    return this.state.hasLegacyMenu;
  }

  get currentMenuItem() {
    return this.state.currentMenuItem;
  }

  get apps() {
    return this.state.apps;
  }

  get showCustomEditor() {
    return this.state.showCustomEditor;
  }

  get loggedOutMenuItemKeys() {
    return loggedOutMenuItems.map(item => item.key);
  }

  get loggedOutMenuItemTargets() {
    return loggedOutMenuItems.map(item => item?.target).filter(target => target);
  }

  getExpandedMenuItems(name: ENavName) {
    if (!name) return;
    return this.state[name].menuItems.reduce((keys, menuItem: IMenuItem) => {
      if (menuItem.isExpanded) {
        keys.push(menuItem.key);
      }
      return keys;
    }, []);
  }

  getMenuItemData(name: ENavName, menuItemKey: EMenuItemKey) {
    return this.state[name].menuItems.find(item => item.key === menuItemKey);
  }
}

@InitAfter('UserService')
@InitAfter('PlatformAppsService')
export class SideNavService extends PersistentStatefulService<ISideNavServiceState> {
  @Inject() userService: UserService;
  @Inject() appService: AppService;
  @Inject() dismissablesService: DismissablesService;
  @Inject() layoutService: LayoutService;
  @Inject() platformAppsService: PlatformAppsService;

  // Since this service persists menu items, for now please change this version
  // when changes are made to navbar
  version = '1';

  static defaultState: ISideNavServiceState = {
    version: '0',
    isOpen: false,
    showCustomEditor: true,
    hasLegacyMenu: true,
    currentMenuItem: EMenuItemKey.Editor,
    compactView: false,
    apps: [null, null, null, null, null], // up to five apps may be displayed in the closed sidebar
    [ENavName.TopNav]: SideBarTopNavData(),
    [ENavName.BottomNav]: SideBarBottomNavData(),
  };

  init() {
    super.init();

    if (this.state.version !== this.version) {
      this.UPDATE_MENU_ITEMS(ENavName.TopNav, SideBarTopNavData().menuItems);
      this.UPDATE_MENU_ITEMS(ENavName.BottomNav, SideBarBottomNavData().menuItems);
      this.SET_VERSION(this.version);
    }

    this.userService.userLoginFinished.subscribe(() => this.handleUserLogin());

    this.handleDismissables();

    /**
     * Determine if the user has the recording history menu item
     */
    const hasRecordingHistory = this.state[ENavName.TopNav].menuItems.find(
      item => item.key === EMenuItemKey.RecordingHistory,
    );

    if (!hasRecordingHistory) {
      // subtract 2 because the Theme Audit should always be the last menu item
      const index = this.state[ENavName.TopNav].menuItems.length - 2;

      // add the recording history to the array of menu items
      const menuItems = [...this.state[ENavName.TopNav].menuItems];
      menuItems.splice(index, 0, SideNavMenuItems()[EMenuItemKey.RecordingHistory]);

      // update the menu items
      this.UPDATE_MENU_ITEMS(ENavName.TopNav, menuItems);
    }

    this.state.currentMenuItem =
      this.layoutService.state.currentTab !== 'default'
        ? this.layoutService.state.currentTab
        : EMenuItemKey.Editor;
  }

  get views() {
    return new SideNavViews(this.state);
  }

  toggleMenuStatus() {
    this.OPEN_CLOSE_MENU();
  }

  setCurrentMenuItem(key: EMenuItemKey | string) {
    this.SET_CURRENT_MENU_ITEM(key);
  }

  setCompactView(isCompact: boolean) {
    this.SET_COMPACT_VIEW(isCompact);
  }

  handleUserLogin() {
    /**
     * Determine if the login is an initial login
     * A legacy user's initial login will have showing the new side nav badge set to true
     * A new user's initial login will have the legacy menu property incorrectly set
     */
    const registrationDate = this.userService.state.createdAt;
    const legacyMenu = registrationDate < new Date('December 8, 2022').valueOf();

    if (
      !(legacyMenu && this.dismissablesService.views.shouldShow(EDismissable.NewSideNav)) &&
      !legacyMenu &&
      this.state.hasLegacyMenu
    ) {
      this.SET_NEW_USER_LOGIN();
    }

    // confirm correct menu item is highlighted
    if (this.state.currentMenuItem !== this.layoutService.state.currentTab) {
      this.SET_CURRENT_MENU_ITEM(this.layoutService.state.currentTab);
    }

    this.dismissablesService.dismiss(EDismissable.LoginPrompt);
  }

  handleDismissables() {
    const loggedIn = this.userService.views.isLoggedIn;
    const registrationDate = this.userService.state.createdAt;
    const legacyMenu = registrationDate < new Date('December 8, 2022').valueOf();

    if (loggedIn) {
      this.dismissablesService.dismiss(EDismissable.LoginPrompt);
      if (legacyMenu && !this.appService.state.onboarded) {
        // show for legacy user's first startup after new side nav date
        this.dismissablesService.views.shouldShow(EDismissable.NewSideNav);
        this.dismissablesService.views.shouldShow(EDismissable.CustomMenuSettings);
      } else {
        this.dismissablesService.dismiss(EDismissable.NewSideNav);
        this.dismissablesService.dismiss(EDismissable.CustomMenuSettings);
      }
    } else {
      // the user is not logged in
      if (legacyMenu) {
        this.dismissablesService.dismiss(EDismissable.LoginPrompt);
        if (!this.appService.state.onboarded) {
          this.dismissablesService.views.shouldShow(EDismissable.NewSideNav);
          this.dismissablesService.views.shouldShow(EDismissable.CustomMenuSettings);
        } else {
          this.dismissablesService.dismiss(EDismissable.NewSideNav);
          this.dismissablesService.dismiss(EDismissable.CustomMenuSettings);
        }
      } else {
        this.dismissablesService.views.shouldShow(EDismissable.LoginPrompt);
        this.dismissablesService.dismiss(EDismissable.NewSideNav);
        this.dismissablesService.dismiss(EDismissable.CustomMenuSettings);
      }
    }
  }

  expandMenuItem(navName: ENavName, key: EMenuItemKey) {
    // expand/contract menu items
    this.EXPAND_MENU_ITEM(navName, key);
  }

  toggleSidebarSubmenu(status?: boolean) {
    // show/hide submenus shown at the parent level
    this.TOGGLE_SIDEBAR_SUBMENU(status);
  }

  setMenuItemStatus(navName: ENavName, menuItemKey: EMenuItemKey, status?: boolean) {
    // show/hide menu items
    this.SET_MENU_ITEM_STATUS(navName, menuItemKey, status);
  }

  toggleMenuItem(navName: ENavName, menuItemKey: EMenuItemKey, status?: boolean) {
    // show/hide menu items
    this.TOGGLE_MENU_ITEM(navName, menuItemKey, status);
  }

  updateAllApps(loadedApps: ILoadedApp[]) {
    this.UPDATE_ALL_APPS(loadedApps);
  }

  toggleApp(appId: string) {
    // show hide apps in menu
    this.TOGGLE_APP(appId);
  }

  replaceApp(newApp: IAppMenuItem, index: number) {
    // add/update apps
    this.REPLACE_APP(newApp, index);
  }

  @mutation()
  private SET_COMPACT_VIEW(isCompact: boolean) {
    this.state.compactView = isCompact;
  }

  @mutation()
  private SET_NEW_USER_LOGIN() {
    // compact view with menu items expanded

    this.state = {
      ...this.state,
      isOpen: true,
      hasLegacyMenu: false,
      compactView: true,
      showCustomEditor: false,
      [ENavName.TopNav]: {
        ...this.state[ENavName.TopNav],
        menuItems: [
          { ...SideNavMenuItems()[EMenuItemKey.Editor], isActive: true },
          { ...SideNavMenuItems()[EMenuItemKey.LayoutEditor], isActive: false },
          { ...SideNavMenuItems()[EMenuItemKey.StudioMode], isActive: false },
          { ...SideNavMenuItems()[EMenuItemKey.Themes], isActive: true },
          { ...SideNavMenuItems()[EMenuItemKey.AppStore], isActive: true },
          { ...SideNavMenuItems()[EMenuItemKey.Highlighter], isActive: true },
          { ...SideNavMenuItems()[EMenuItemKey.RecordingHistory], isActive: true },
          { ...SideNavMenuItems()[EMenuItemKey.ThemeAudit], isActive: true },
        ],
      },
      [ENavName.BottomNav]: {
        ...this.state[ENavName.BottomNav],
        menuItems: this.state[ENavName.BottomNav].menuItems.map((menuItem: IMenuItem) => {
          if (menuItem.key === EMenuItemKey.Dashboard) {
            return {
              ...this.state[ENavName.BottomNav].menuItems[EMenuItemKey.Dashboard],
              isExpanded: true,
            };
          }
          return menuItem;
        }),
      },
    };
  }

  @mutation()
  private OPEN_CLOSE_MENU() {
    this.state.isOpen = !this.state.isOpen;
  }

  @mutation()
  private TOGGLE_SIDEBAR_SUBMENU(status?: boolean) {
    // currently only the custom editor needs to
    // have the option to show/hide in the sidebar
    this.state.showCustomEditor = status ?? !this.state.showCustomEditor;
  }

  @mutation()
  private TOGGLE_MENU_ITEM(navName: ENavName, menuItemKey: EMenuItemKey, status?: boolean) {
    // toggle boolean value
    this.state[navName] = {
      ...this.state[navName],
      menuItems: [
        ...this.state[navName].menuItems.map(menuItem => {
          if (menuItem.key === menuItemKey) {
            return { ...menuItem, isActive: status ?? !menuItem?.isActive };
          }
          return menuItem;
        }),
      ],
    };
  }

  @mutation()
  private SET_MENU_ITEM_STATUS(navName: ENavName, menuItemKey: EMenuItemKey, status: boolean) {
    this.state[navName] = {
      ...this.state[navName],
      menuItems: [
        ...this.state[navName].menuItems.map(menuItem => {
          if (menuItem.key === menuItemKey) {
            return { ...menuItem, isActive: status };
          }
          return menuItem;
        }),
      ],
    };
  }

  @mutation()
  private UPDATE_ALL_APPS(currentApps: ILoadedApp[]) {
    this.state.apps = this.state.apps.map(app => {
      const activeApp = currentApps.find(currentApp => currentApp.id === app?.id);
      if (!activeApp) return null;
      return app;
    });
  }

  @mutation()
  private TOGGLE_APP(appId: string) {
    this.state.apps = this.state.apps.map(app => {
      if (!app) return null;

      if (app.id === appId) {
        return { ...app, isActive: !app.isActive };
      }

      return app;
    });
  }

  @mutation()
  private REPLACE_APP(newApp: IAppMenuItem, index: number) {
    const updatedApps = this.state.apps.map((app, i) => {
      if (i === index) return newApp;

      if (!app || app?.id === newApp.id) {
        // if the new app is already in the array, remove it
        return null;
      }

      return app;
    });
    this.state.apps = updatedApps;
  }

  @mutation()
  private EXPAND_MENU_ITEM(navName: ENavName, key: EMenuItemKey) {
    // toggle boolean value
    this.state[navName] = {
      ...this.state[navName],
      menuItems: [
        ...this.state[navName].menuItems.map(menuItem => {
          if (menuItem.key === key) {
            return { ...menuItem, isExpanded: !menuItem.isExpanded };
          }
          return menuItem;
        }),
      ],
    };
  }

  @mutation()
  private SET_CURRENT_MENU_ITEM(key: EMenuItemKey | string) {
    this.state.currentMenuItem = key;
  }

  /**
   * Update menu items in the side nav
   *
   * @remark - because the rendered menu items are in an array, replace the entire array to update the menu
   * @param navName - Name of the menu to update
   * @param menuItems - Updated menu items
   */
  @mutation()
  private UPDATE_MENU_ITEMS(navName: ENavName, menuItems: (IMenuItem | IParentMenuItem)[]) {
    this.state[navName] = {
      name: navName,
      menuItems: [...menuItems],
    };
  }

  @mutation()
  private SET_VERSION(version: string) {
    this.state.version = version;
  }
}
